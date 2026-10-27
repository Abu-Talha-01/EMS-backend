const Attendance = require('../models/Attendance');
const Employee   = require('../models/Employee');
const Shift      = require('../models/Shift');
const Holiday    = require('../models/Holiday');
const Role       = require('../models/Role');
const { getAttendanceSummary, getWorkingDaysInMonth, getHolidaysInRange } = require('../services/attendanceService');
const { createAuditLog } = require('../utils/auditHelper');
const db = require('../config/db');

exports.checkIn = async (req, res, next) => {
    try {
        const employee = await Employee.findByUserId(req.user.id);
        if (!employee) return res.status(404).json({ error: 'Employee profile not found' });

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const existing = await Attendance.findByEmployeeAndDate(employee._id, today);
        if (existing?.checkIn) return res.status(409).json({ error: 'Already checked in today', attendance: existing });

        const shift   = await Shift.findActive();
        const checkIn = new Date();
        let hoursWorked = 0, lateMinutes = 0;

        if (shift) {
            const [sh, sm] = shift.startTime.split(':').map(Number);
            const shiftMs  = (sh * 60 + sm) * 60000;
            const nowMs    = checkIn.getHours() * 3600000 + checkIn.getMinutes() * 60000;
            lateMinutes    = Math.max(0, Math.round((nowMs - shiftMs) / 60000) - (shift.graceMinutes || 15));
        }

        const { lat, lng, address, isWFH, source = 'web' } = req.body;
        await Attendance.upsertAttendance(employee._id, today, {
            employee: employee._id,
            date:     today,
            checkIn,
            status:   isWFH ? 'work_from_home' : 'present',
            shift:    shift?._id || null,
            lateMinutes,
            hoursWorked,
            source,
            location: lat ? { checkIn: { lat, lng, address } } : {},
        });

        res.json({ message: `Checked in at ${checkIn.toLocaleTimeString('en-IN')}` });
    } catch (error) { next(error); }
};

exports.checkOut = async (req, res, next) => {
    try {
        const employee = await Employee.findByUserId(req.user.id);
        if (!employee) return res.status(404).json({ error: 'Employee profile not found' });

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const record = await Attendance.findByEmployeeAndDate(employee._id, today);
        if (!record?.checkIn)  return res.status(400).json({ error: 'No check-in found for today' });
        if (record.checkOut)   return res.status(409).json({ error: 'Already checked out today' });

        const checkOut    = new Date();
        const diffMs      = checkOut - new Date(record.checkIn);
        const hoursWorked = Math.round(diffMs / 60000);

        const shift = record.shift ? await db.getDb().collection('shifts').findOne({ _id: record.shift }) : null;
        const expectedMins   = shift ? shift.workingHours * 60 : 480;
        const overtimeMinutes = Math.max(0, hoursWorked - expectedMins);

        let status = record.status;
        if (!['work_from_home', 'on_leave'].includes(status)) {
            if (hoursWorked >= expectedMins * 0.9)      status = 'present';
            else if (hoursWorked >= expectedMins * 0.5) status = 'half_day';
            else                                        status = 'absent';
        }

        const { lat, lng, address } = req.body;
        await Attendance.upsertAttendance(employee._id, today, {
            checkOut, hoursWorked, overtimeMinutes, status,
            ...(lat ? { 'location.checkOut': { lat, lng, address } } : {}),
        });

        res.json({
            message: `Checked out at ${checkOut.toLocaleTimeString('en-IN')}`,
            hoursWorked: `${Math.floor(hoursWorked / 60)}h ${hoursWorked % 60}m`,
        });
    } catch (error) { next(error); }
};

exports.getTodayStatus = async (req, res, next) => {
    try {
        const employee = await Employee.findByUserId(req.user.id);
        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        const today    = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
        const [record, holiday, shift] = await Promise.all([
            Attendance.findByEmployeeAndDate(employee._id, today),
            Holiday.findInRange(today, tomorrow).then((h) => h[0] || null),
            Shift.findActive(),
        ]);
        res.json({ date: today, attendance: record, holiday, shift, isCheckedIn: !!record?.checkIn, isCheckedOut: !!record?.checkOut, serverTime: new Date() });
    } catch (error) { next(error); }
};

exports.getHistory = async (req, res, next) => {
    try {
        const { employeeId, month, year } = req.query;
        let empId;
        if (employeeId && Role.canReadEmployees(req.user.role)) {
            empId = (await Employee.findById(employeeId))?._id;
        } else {
            empId = (await Employee.findByUserId(req.user.id))?._id;
        }
        if (!empId) return res.status(404).json({ error: 'Employee not found' });

        const y = parseInt(year) || new Date().getFullYear();
        const m = parseInt(month) || new Date().getMonth() + 1;
        const start = new Date(y, m - 1, 1);
        const end   = new Date(y, m, 0, 23, 59, 59);

        const [records, summary, holidays] = await Promise.all([
            Attendance.findByEmployee(empId, start, end),
            getAttendanceSummary(empId, y, m),
            getHolidaysInRange(start, end),
        ]);
        res.json({ records, summary, holidays, month: m, year: y });
    } catch (error) { next(error); }
};

exports.manualEntry = async (req, res, next) => {
    try {
        const { employeeId, date, checkIn, checkOut, status, note } = req.body;
        const employee = await Employee.findById(employeeId);
        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        const d = new Date(date); d.setHours(0, 0, 0, 0);
        const shift = await Shift.findActive();
        const record = await Attendance.upsertAttendance(employee._id, d, {
            employee: employee._id, date: d,
            checkIn:  checkIn  ? new Date(checkIn)  : null,
            checkOut: checkOut ? new Date(checkOut) : null,
            status, note, shift: shift?._id, isManualEntry: true, approvedBy: req.user.id,
        });
        await createAuditLog(req, 'UPDATE', 'Attendance', record._id, { employeeId, date, status });
        res.json({ message: 'Attendance updated', attendance: record });
    } catch (error) { next(error); }
};

exports.getMonthlySummary = async (req, res, next) => {
    try {
        const { month, year } = req.query;
        const y = parseInt(year) || new Date().getFullYear();
        const m = parseInt(month) || new Date().getMonth() + 1;
        const start = new Date(y, m - 1, 1);
        const end   = new Date(y, m, 0, 23, 59, 59);
        const col   = db.getDb().collection('attendance');

        const [perEmployee, overall, holidays, workingDays] = await Promise.all([
            col.aggregate([
                { $match: { date: { $gte: start, $lte: end } } },
                { $group: { _id: '$employee', present: { $sum: { $cond: [{ $eq: ['$status','present'] }, 1, 0] } }, absent: { $sum: { $cond: [{ $eq: ['$status','absent'] }, 1, 0] } }, wfh: { $sum: { $cond: [{ $eq: ['$status','work_from_home'] }, 1, 0] } } } },
            ]).toArray(),
            col.aggregate([
                { $match: { date: { $gte: start, $lte: end } } },
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]).toArray(),
            getHolidaysInRange(start, end),
            getWorkingDaysInMonth(y, m),
        ]);
        res.json({ perEmployee, overall, holidays, workingDays, month: m, year: y });
    } catch (error) { next(error); }
};

exports.getShifts    = async (req, res, next) => { try { res.json({ shifts: await Shift.findAll() }); } catch (e) { next(e); } };
exports.createShift  = async (req, res, next) => { try { res.status(201).json({ shift: await Shift.createShift({ ...req.body, createdBy: req.user.id }) }); } catch (e) { next(e); } };
exports.updateShift  = async (req, res, next) => { try { res.json({ shift: await Shift.updateShift(req.params.id, req.body) }); } catch (e) { next(e); } };
exports.getHolidays  = async (req, res, next) => { try { res.json({ holidays: await Holiday.findByYear(req.query.year || new Date().getFullYear()) }); } catch (e) { next(e); } };
exports.createHoliday= async (req, res, next) => { try { res.status(201).json({ holiday: await Holiday.createHoliday(req.body) }); } catch (e) { next(e); } };
exports.deleteHoliday= async (req, res, next) => { try { await Holiday.deleteHoliday(req.params.id); res.json({ message: 'Holiday removed' }); } catch (e) { next(e); } };
