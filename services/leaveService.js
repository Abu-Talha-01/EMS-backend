const LeaveBalance = require('../models/LeaveBalance');
const LeavePolicy  = require('../models/LeavePolicy');

const initializeLeaveBalance = async (employeeId, year = new Date().getFullYear()) => {
    const existing = await LeaveBalance.findByEmployeeYear(employeeId, year);
    if (existing) return existing;
    const policies  = await LeavePolicy.findAll();
    const balances  = policies.map((p) => ({ leaveType: p.leaveType, code: p.code, allocated: p.daysAllowed, used: 0, pending: 0, carryForward: 0, available: p.daysAllowed }));
    return LeaveBalance.createBalance(employeeId, year, balances);
};

const _updateEntry = async (employeeId, year, leaveType, mutate) => {
    const balance = await LeaveBalance.findByEmployeeYear(employeeId, year);
    if (!balance) throw new Error('Leave balance not found');
    const idx = balance.balances.findIndex((b) => b.leaveType === leaveType);
    if (idx === -1) throw new Error(`Leave type ${leaveType} not in balance`);
    mutate(balance.balances[idx]);
    return LeaveBalance.updateBalance(employeeId, year, balance.balances);
};

const deductLeaveBalance = (employeeId, leaveType, days, year = new Date().getFullYear()) =>
    _updateEntry(employeeId, year, leaveType, (e) => {
        if (e.available < days) throw new Error(`Insufficient balance. Available: ${e.available}`);
        e.pending   += days;
        e.available -= days;
    });

const consumeLeaveBalance = (employeeId, leaveType, days, year = new Date().getFullYear()) =>
    _updateEntry(employeeId, year, leaveType, (e) => { e.pending -= days; e.used += days; });

const refundLeaveBalance = (employeeId, leaveType, days, year = new Date().getFullYear()) =>
    _updateEntry(employeeId, year, leaveType, (e) => { e.pending = Math.max(0, e.pending - days); e.available += days; });

module.exports = { initializeLeaveBalance, deductLeaveBalance, consumeLeaveBalance, refundLeaveBalance };
