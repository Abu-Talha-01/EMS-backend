const Holiday = require('../models/Holiday');
const Attendance = require('../models/Attendance');

const getHolidaysInRange = (from, to) => Holiday.findInRange(from, to);

const getWorkingDaysInMonth = async (year, month, weeklyOffs = ['Saturday', 'Sunday']) => {
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 0);
    const holidays = await getHolidaysInRange(start, end);
    const holidayDates = new Set(holidays.map((h) => new Date(h.date).toDateString()));
    let count = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
        if (!weeklyOffs.includes(dayName) && !holidayDates.has(d.toDateString())) count++;
    }
    return count;
};

const getAttendanceSummary = async (employeeId, year, month) => {
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 0, 23, 59, 59);
    const records = await Attendance.findByEmployee(employeeId, start, end);

    const summary = { present: 0, absent: 0, half_day: 0, work_from_home: 0, on_leave: 0, holiday: 0, weekly_off: 0, totalHoursWorked: 0, totalOvertimeMinutes: 0, totalLateMinutes: 0 };
    records.forEach((r) => {
        if (summary[r.status] !== undefined) summary[r.status]++;
        summary.totalHoursWorked      += r.hoursWorked      || 0;
        summary.totalOvertimeMinutes  += r.overtimeMinutes  || 0;
        summary.totalLateMinutes      += r.lateMinutes      || 0;
    });

    summary.workingDays   = await getWorkingDaysInMonth(year, month);
    summary.effectiveDays = summary.present + summary.work_from_home + (summary.half_day * 0.5);
    return summary;
};

const getDateRange = (from, to) => {
    const dates = [];
    for (let d = new Date(from); d <= new Date(to); d.setDate(d.getDate() + 1)) dates.push(new Date(d));
    return dates;
};

const countLeaveDays = async (from, to, weeklyOffs = ['Saturday', 'Sunday']) => {
    const holidays = await getHolidaysInRange(from, to);
    const holidayDates = new Set(holidays.map((h) => new Date(h.date).toDateString()));
    return getDateRange(from, to).filter((d) => {
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
        return !weeklyOffs.includes(dayName) && !holidayDates.has(d.toDateString());
    }).length;
};

module.exports = { getHolidaysInRange, getWorkingDaysInMonth, getAttendanceSummary, getDateRange, countLeaveDays };
