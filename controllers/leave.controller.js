const { validationResult } = require('express-validator');
const LeaveRequest = require('../models/LeaveRequest');
const LeaveBalance = require('../models/LeaveBalance');
const LeavePolicy  = require('../models/LeavePolicy');
const Attendance   = require('../models/Attendance');
const Employee     = require('../models/Employee');
const Role         = require('../models/Role');
const { countLeaveDays, getDateRange } = require('../services/attendanceService');
const { initializeLeaveBalance, deductLeaveBalance, refundLeaveBalance, consumeLeaveBalance } = require('../services/leaveService');
const { createAuditLog } = require('../utils/auditHelper');
const db = require('../config/db');
const { ObjectId } = require('mongodb');

const populateLeaveRequests = (match) => db.getDb().collection('leave_requests').aggregate([
    { $match: match },
    { $lookup: { from: 'employees', localField: 'employee', foreignField: '_id', as: 'employee' } },
    { $unwind: { path: '$employee', preserveNullAndEmptyArrays: true } },
    { $sort: { createdAt: -1 } },
]).toArray();

exports.applyLeave = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { leaveType, from, to, reason, isHalfDay, halfDaySession } = req.body;
        const employee = await Employee.findByUserId(req.user.id);
        if (!employee) return res.status(404).json({ error: 'Employee profile not found' });

        const policy = await LeavePolicy.findByType(leaveType);
        if (!policy) return res.status(404).json({ error: 'Leave type not found' });

        const fromDate = new Date(from);
        const toDate   = new Date(to);
        if (fromDate > toDate) return res.status(400).json({ error: 'From date cannot be after To date' });

        const totalDays = isHalfDay ? 0.5 : await countLeaveDays(fromDate, toDate);
        const year = fromDate.getFullYear();

        let balance = await LeaveBalance.findByEmployeeYear(employee._id, year);
        if (!balance) balance = await initializeLeaveBalance(employee._id, year);

        const entry = balance.balances.find((b) => b.leaveType === leaveType);
        if (entry && entry.available < totalDays && policy.isPaid)
            return res.status(400).json({ error: `Insufficient balance. Available: ${entry.available}, Requested: ${totalDays}` });

        // Build approval chain
        const approvalChain = [];
        if (employee.professional?.reportingManager) {
            approvalChain.push({ approver: new ObjectId(employee.professional.reportingManager), level: 1, role: 'Reporting Manager', action: 'pending' });
        }
        // Find HR employee
        const hrUser = await db.getDb().collection('users').findOne({ role: { $in: ['HRManager', 'HR', 'Admin', 'SuperAdmin'] }, isActive: true });
        if (hrUser) {
            const hrEmp = await Employee.findByUserId(hrUser._id);
            if (hrEmp) approvalChain.push({ approver: hrEmp._id, level: 2, role: 'HR', action: 'pending' });
        }
        if (approvalChain.length === 0) approvalChain.push({ level: 1, role: 'HR', action: 'pending' });

        const request = await LeaveRequest.createRequest({ employee: employee._id, leaveType, from: fromDate, to: toDate, totalDays, reason, isHalfDay: !!isHalfDay, halfDaySession, approvalChain });
        if (policy.isPaid) await deductLeaveBalance(employee._id, leaveType, totalDays, year);
        await createAuditLog(req, 'CREATE', 'LeaveRequest', request._id, { leaveType, from, to, totalDays });
        res.status(201).json({ message: 'Leave application submitted', request });
    } catch (error) { next(error); }
};

exports.getMyLeaves = async (req, res, next) => {
    try {
        const employee = await Employee.findByUserId(req.user.id);
        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        const { status } = req.query;
        const query = status ? { status } : {};
        const requests = await LeaveRequest.findByEmployee(employee._id, query);
        res.json({ requests, total: requests.length });
    } catch (error) { next(error); }
};

exports.getPendingApprovals = async (req, res, next) => {
    try {
        if (Role.isAdminRole(req.user.role)) {
            const requests = await populateLeaveRequests({ status: 'pending' });
            return res.json({ requests, total: requests.length });
        }
        const approver = await Employee.findByUserId(req.user.id);
        if (!approver) return res.status(404).json({ error: 'Employee not found' });
        const requests = await populateLeaveRequests({
            status: 'pending',
            approvalChain: { $elemMatch: { approver: approver._id, action: 'pending' } },
        });
        res.json({ requests, total: requests.length });
    } catch (error) { next(error); }
};

exports.actionOnLeave = async (req, res, next) => {
    try {
        const { action, comment } = req.body;
        if (!['approved', 'rejected'].includes(action)) return res.status(400).json({ error: 'Action must be approved or rejected' });

        const request = await LeaveRequest.findById(req.params.id);
        if (!request) return res.status(404).json({ error: 'Leave request not found' });
        if (request.status !== 'pending') return res.status(400).json({ error: `Leave is already ${request.status}` });

        const approverEmp = await Employee.findByUserId(req.user.id);
        const isAdmin = Role.isAdminRole(req.user.role);
        let step = approverEmp ? request.approvalChain.find(
            (a) => a.approver?.toString() === approverEmp._id.toString() && a.action === 'pending'
        ) : null;
        if (!step && isAdmin) {
            step = { approver: approverEmp?._id || new ObjectId(req.user.id), level: request.approvalChain.length + 1, role: req.user.role, action: 'pending' };
            request.approvalChain.push(step);
        }
        if (!step) return res.status(403).json({ error: 'Not authorized to action this request' });

        step.action  = action;
        step.comment = comment;
        step.actionAt = new Date();
        if (isAdmin) {
            request.approvalChain = request.approvalChain.map((item) => (
                item.action === 'pending'
                    ? { ...item, action, comment: comment || `Actioned by ${req.user.role}`, actionAt: new Date() }
                    : item
            ));
        }

        let finalStatus = 'pending';
        if (action === 'rejected') {
            finalStatus = 'rejected';
            const policy = await LeavePolicy.findByType(request.leaveType);
            if (policy?.isPaid) await refundLeaveBalance(request.employee, request.leaveType, request.totalDays, new Date(request.from).getFullYear());
        } else {
            const nextStep = request.approvalChain.find((a) => a.level === step.level + 1 && a.action === 'pending');
            if (!nextStep) {
                finalStatus = 'approved';
                // Create attendance records
                const dates = getDateRange(request.from, request.to);
                for (const date of dates) {
                    const d = new Date(date); d.setHours(0, 0, 0, 0);
                    await Attendance.upsertAttendance(request.employee, d, {
                        employee: request.employee, date: d, status: 'on_leave',
                        isManualEntry: true, note: `Approved ${request.leaveType} leave`,
                    });
                }
                await consumeLeaveBalance(request.employee, request.leaveType, request.totalDays, new Date(request.from).getFullYear());
            }
        }

        await LeaveRequest.updateRequest(req.params.id, { status: finalStatus, approvalChain: request.approvalChain, attendanceRecordsCreated: finalStatus === 'approved' });
        await createAuditLog(req, 'UPDATE', 'LeaveRequest', request._id, { action, comment });
        res.json({ message: `Leave ${action} successfully` });
    } catch (error) { next(error); }
};

exports.cancelLeave = async (req, res, next) => {
    try {
        const request  = await LeaveRequest.findById(req.params.id);
        if (!request) return res.status(404).json({ error: 'Leave request not found' });
        const employee = await Employee.findByUserId(req.user.id);
        const isOwner  = request.employee.toString() === employee?._id.toString();
        if (!isOwner && !Role.isAdminRole(req.user.role)) return res.status(403).json({ error: 'Access denied' });
        if (['cancelled','rejected'].includes(request.status)) return res.status(400).json({ error: `Leave already ${request.status}` });

        await LeaveRequest.updateRequest(req.params.id, { status: 'cancelled', cancelledAt: new Date(), cancelReason: req.body.reason || 'Cancelled' });
        const policy = await LeavePolicy.findByType(request.leaveType);
        if (policy?.isPaid) await refundLeaveBalance(request.employee, request.leaveType, request.totalDays, new Date(request.from).getFullYear());
        res.json({ message: 'Leave cancelled successfully' });
    } catch (error) { next(error); }
};

exports.getLeaveBalance = async (req, res, next) => {
    try {
        const { employeeId, year = new Date().getFullYear() } = req.query;
        let empId;
        if (employeeId && Role.canReadEmployees(req.user.role)) empId = employeeId;
        else empId = (await Employee.findByUserId(req.user.id))?._id;
        let balance = await LeaveBalance.findByEmployeeYear(empId, year);
        if (!balance) balance = await initializeLeaveBalance(empId, parseInt(year));
        res.json({ balance });
    } catch (error) { next(error); }
};

exports.getAllLeaves = async (req, res, next) => {
    try {
        const { status, leaveType, page = 1, limit = 20 } = req.query;
        const query = {};
        if (status)    query.status    = status;
        if (leaveType) query.leaveType = leaveType;
        const col   = db.getDb().collection('leave_requests');
        const skip  = (parseInt(page) - 1) * parseInt(limit);
        const [requests, total] = await Promise.all([
            col.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).toArray(),
            col.countDocuments(query),
        ]);
        res.json({ requests, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (error) { next(error); }
};

exports.getPolicies    = async (req, res, next) => { try { res.json({ policies: await LeavePolicy.findAll() }); } catch (e) { next(e); } };
exports.createPolicy   = async (req, res, next) => { try { res.status(201).json({ policy: await LeavePolicy.createPolicy(req.body) }); } catch (e) { next(e); } };
exports.updatePolicy   = async (req, res, next) => { try { res.json({ policy: await LeavePolicy.updatePolicy(req.params.id, req.body) }); } catch (e) { next(e); } };
