const { validationResult } = require('express-validator');
const Employee   = require('../models/Employee');
const User       = require('../models/User');
const Department = require('../models/Department');
const Role       = require('../models/Role');
const { createAuditLog } = require('../utils/auditHelper');
const db = require('../config/db');
const { ObjectId } = require('mongodb');

exports.getAllEmployees = async (req, res, next) => {
    try {
        const { employees, total } = await Employee.findAll(req.query);
        const page  = parseInt(req.query.page)  || 1;
        const limit = parseInt(req.query.limit) || 10;
        res.json({ employees, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
    } catch (error) { next(error); }
};

exports.getMyEmployee = async (req, res, next) => {
    try {
        const employee = await Employee.findByUserId(req.user.id);
        if (!employee) return res.status(404).json({ error: 'Employee profile not found' });
        const employeeWithDetails = await Employee.findByIdWithDetails(employee._id);
        res.json({ employee: employeeWithDetails || employee });
    } catch (error) { next(error); }
};

exports.getEmployee = async (req, res, next) => {
    try {
        const employee = await Employee.findByIdWithDetails(req.params.id);
        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        if (req.user.role === 'Employee' && employee.user?._id?.toString() !== req.user.id)
            return res.status(403).json({ error: 'Access denied' });
        res.json({ employee });
    } catch (error) { next(error); }
};

exports.createEmployee = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { email, password, role = 'Employee', personal, professional, salary } = req.body;
        const normalizedRole = Role.normalizeRole(role);
        const roleDoc = await Role.findByName(normalizedRole);
        if (!roleDoc) return res.status(400).json({ error: 'Invalid role' });
        if (normalizedRole === 'SuperAdmin' && req.user.role !== 'SuperAdmin')
            return res.status(403).json({ error: 'Only SuperAdmin can create another SuperAdmin' });

        const existingUser = await User.findByEmail(email);
        if (existingUser) return res.status(409).json({ error: 'Email already in use' });

        const dept = await Department.findById(professional.department);
        if (!dept) return res.status(404).json({ error: 'Department not found' });

        const user = await User.createUser({ name: `${personal.firstName} ${personal.lastName}`, email, password: password || 'EMS@123456', role: normalizedRole });
        const employee = await Employee.createEmployee({ user: user._id, personal, professional, salary, createdBy: req.user.id });
        await User.updateUser(user._id, { employeeId: employee.employeeId });

        await createAuditLog(req, 'CREATE', 'Employee', employee._id, { employeeId: employee.employeeId, email });
        res.status(201).json({ message: `Employee ${employee.employeeId} created successfully`, employee });
    } catch (error) { next(error); }
};

exports.updateEmployee = async (req, res, next) => {
    try {
        const employee = await Employee.findById(req.params.id);
        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        const { role, isActive, email, password, ...employeeUpdates } = req.body;
        const updated = await Employee.updateEmployee(req.params.id, { ...employeeUpdates, updatedBy: req.user.id });
        if (role) {
            const normalizedRole = Role.normalizeRole(role);
            const roleDoc = await Role.findByName(normalizedRole);
            if (!roleDoc) return res.status(400).json({ error: 'Invalid role' });
            if (normalizedRole === 'SuperAdmin' && req.user.role !== 'SuperAdmin')
                return res.status(403).json({ error: 'Only SuperAdmin can assign SuperAdmin role' });
            await User.updateUser(employee.user, { role: normalizedRole });
        }
        if (typeof isActive === 'boolean') await User.updateUser(employee.user, { isActive });
        await createAuditLog(req, 'UPDATE', 'Employee', employee._id, req.body);
        res.json({ message: 'Employee updated successfully', employee: updated });
    } catch (error) { next(error); }
};

exports.activateEmployee = async (req, res, next) => {
    try {
        const employee = await Employee.findById(req.params.id);
        if (!employee) return res.status(404).json({ error: 'Employee not found' });

        await Employee.updateEmployee(req.params.id, {
            status: 'active',
            terminationDate: null,
            terminationReason: null,
            updatedBy: req.user.id,
        });
        await User.updateUser(employee.user, { isActive: true });
        await createAuditLog(req, 'UPDATE', 'Employee', employee._id, { action: 'ACTIVATE' });
        res.json({ message: `Employee ${employee.employeeId} activated successfully` });
    } catch (error) { next(error); }
};

exports.terminateEmployee = async (req, res, next) => {
    try {
        const { reason, terminationDate } = req.body;
        const employee = await Employee.findById(req.params.id);
        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        if (employee.user.toString() === req.user.id) return res.status(400).json({ error: 'You cannot terminate your own account' });

        await Employee.updateEmployee(req.params.id, {
            status: 'terminated',
            terminationDate: terminationDate || new Date(),
            terminationReason: reason,
            updatedBy: req.user.id,
        });
        await User.updateUser(employee.user, { isActive: false });
        await createAuditLog(req, 'UPDATE', 'Employee', employee._id, { action: 'TERMINATE', reason });
        res.json({ message: `Employee ${employee.employeeId} terminated successfully` });
    } catch (error) { next(error); }
};

exports.deleteEmployee = async (req, res, next) => {
    try {
        const employee = await Employee.findById(req.params.id);
        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        if (employee.user.toString() === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });

        await Employee.deleteEmployee(req.params.id);
        await User.deleteUser(employee.user);
        await createAuditLog(req, 'DELETE', 'Employee', employee._id, { employeeId: employee.employeeId, userId: employee.user });

        res.json({ message: `Employee ${employee.employeeId} deleted permanently` });
    } catch (error) { next(error); }
};

exports.getEmployeeStats = async (req, res, next) => {
    try {
            const employees = db.getDb().collection('employees');
            const attendance = db.getDb().collection('attendance');
            const leave = db.getDb().collection('leave_requests');

            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            const startOfMonth = new Date(year, month - 1, 1);
            const endOfMonth = new Date(year, month, 0, 23, 59, 59);
            const last90Days = new Date(now);
            last90Days.setDate(now.getDate() - 89);

            const [
                totalEmployees,
                totalActive,
                totalTerminated,
                totalInactive,
                avgSalaryResult,
                byDepartment,
                byEmploymentType,
                byWorkLocation,
                byStatus,
                recentJoinees,
                attendanceTrend,
                attendanceBubble,
                leaveTypeChart,
                leaveStatusChart,
                leaveBubble,
                leaveTrendData,
            ] = await Promise.all([
                employees.countDocuments(),
                employees.countDocuments({ status: 'active' }),
                employees.countDocuments({ status: 'terminated' }),
                employees.countDocuments({ status: 'inactive' }),
                employees.aggregate([
                    { $match: { status: 'active' } },
                    { $group: { _id: null, avgCtc: { $avg: '$salary.ctc' } } },
                ]).toArray(),
                employees.aggregate([
                    { $match: { status: 'active' } },
                    { $group: { _id: '$professional.department', count: { $sum: 1 } } },
                    { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dept' } },
                    { $project: { department: { $arrayElemAt: ['$dept.name', 0] }, count: 1 } },
                    { $sort: { count: -1 } },
                ]).toArray(),
                employees.aggregate([
                    { $match: { status: 'active' } },
                    { $group: { _id: '$professional.employmentType', count: { $sum: 1 } } },
                ]).toArray(),
                employees.aggregate([
                    { $match: { status: 'active' } },
                    { $group: { _id: '$professional.workLocation', count: { $sum: 1 } } },
                ]).toArray(),
                employees.aggregate([
                    { $group: { _id: '$status', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                ]).toArray(),
                employees.aggregate([
                    { $match: { status: 'active' } },
                    { $sort: { createdAt: -1 } },
                    { $limit: 5 },
                    { $lookup: {
                        from: 'departments',
                        localField: 'professional.department',
                        foreignField: '_id',
                        as: 'departmentData',
                    } },
                    { $addFields: { 'professional.department': { $arrayElemAt: ['$departmentData', 0] } } },
                    { $project: { departmentData: 0 } },
                ]).toArray(),
                attendance.aggregate([
                    { $match: { date: { $gte: last90Days, $lte: now } } },
                    { $group: { _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, status: '$status' }, count: { $sum: 1 } } },
                    { $group: { _id: '$_id.date', statuses: { $push: { status: '$_id.status', count: '$count' } } } },
                    { $sort: { '_id': 1 } },
                ]).toArray(),
                attendance.aggregate([
                    { $match: { date: { $gte: startOfMonth, $lte: endOfMonth } } },
                    { $group: { _id: '$employee', present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } }, absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } }, wfh: { $sum: { $cond: [{ $eq: ['$status', 'work_from_home'] }, 1, 0] } }, leave: { $sum: { $cond: [{ $eq: ['$status', 'on_leave'] }, 1, 0] } } } },
                    { $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'employee' } },
                    { $unwind: { path: '$employee', preserveNullAndEmptyArrays: true } },
                    { $project: { present: 1, absent: 1, wfh: 1, leave: 1, name: { $concat: ['$employee.personal.firstName', ' ', '$employee.personal.lastName'] }, employeeId: '$employee.employeeId' } },
                    { $sort: { present: -1 } },
                    { $limit: 40 },
                ]).toArray(),
                leave.aggregate([
                    { $group: { _id: '$leaveType', count: { $sum: 1 }, totalDays: { $sum: '$totalDays' } } },
                    { $sort: { count: -1 } },
                ]).toArray(),
                leave.aggregate([
                    { $group: { _id: '$status', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                ]).toArray(),
                leave.aggregate([
                    { $group: { _id: '$leaveType', avgDays: { $avg: '$totalDays' }, totalDays: { $sum: '$totalDays' }, count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                ]).toArray(),
                leave.aggregate([
                    { $match: { createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } } },
                    { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
                    { $sort: { '_id.year': 1, '_id.month': 1 } },
                ]).toArray(),
            ]);

            const averageSalary = avgSalaryResult?.[0]?.avgCtc ? Math.round(avgSalaryResult[0].avgCtc) : 0;
            const attendanceTrendData = attendanceTrend.map((item) => ({
                date: item._id,
                present: item.statuses.find((s) => s.status === 'present')?.count || 0,
                absent: item.statuses.find((s) => s.status === 'absent')?.count || 0,
                workFromHome: item.statuses.find((s) => s.status === 'work_from_home')?.count || 0,
                onLeave: item.statuses.find((s) => s.status === 'on_leave')?.count || 0,
            }));
            const attendanceBubbleData = attendanceBubble.map((item) => ({
                x: item.present,
                y: item.absent,
                z: item.wfh + item.leave + 1,
                name: item.name || item.employeeId || 'Employee',
            }));
            const leaveTypeChartData = leaveTypeChart.map((item) => ({ name: item._id, value: item.count }));
            const leaveStatusChartData = leaveStatusChart.map((item) => ({ name: item._id, value: item.count }));
            const leaveBubbleData = leaveBubble.map((item) => ({
                x: item.count,
                y: Math.round(item.avgDays * 10) / 10,
                z: item.totalDays || 1,
                name: item._id,
            }));
            const leaveTrendOutput = [];
            const trendMap = new Map(leaveTrendData.map((item) => [`${item._id.year}-${item._id.month}`, item.count]));
            for (let i = 5; i >= 0; i -= 1) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
                leaveTrendOutput.push({ month: d.toLocaleString('default', { month: 'short' }), count: trendMap.get(key) || 0 });
            }

            res.json({
                totalEmployees,
                totalActive,
                totalTerminated,
                totalInactive,
                averageSalary,
                byDepartment,
                byEmploymentType,
                byWorkLocation,
                byStatus,
                recentJoinees,
                attendanceTrend: attendanceTrendData,
                attendanceScatter: attendanceBubbleData,
                leaveTypeChart: leaveTypeChartData,
                leaveStatusChart: leaveStatusChartData,
                leaveBubble: leaveBubbleData,
                leaveTrend: leaveTrendOutput,
            });
        } catch (error) { next(error); }
};
