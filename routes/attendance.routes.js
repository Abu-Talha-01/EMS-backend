const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/attendance.controller');
const { authenticate, authorize, authorizePermission } = require('../middleware/auth');

router.use(authenticate);

// Employee self-service
router.post('/check-in',    ctrl.checkIn);
router.post('/check-out',   ctrl.checkOut);
router.get('/today',        ctrl.getTodayStatus);
router.get('/history',      ctrl.getHistory);

// HR/Admin
router.post('/manual',      authorizePermission('attendance:manage'), ctrl.manualEntry);
router.get('/monthly-summary', authorizePermission('attendance:read_all', 'attendance:read_team', 'attendance:manage'), ctrl.getMonthlySummary);

// Shifts
router.get('/shifts',       ctrl.getShifts);
router.post('/shifts',      authorizePermission('attendance:manage'), ctrl.createShift);
router.patch('/shifts/:id', authorizePermission('attendance:manage'), ctrl.updateShift);

// Holidays
router.get('/holidays',     ctrl.getHolidays);
router.post('/holidays',    authorizePermission('attendance:manage'), ctrl.createHoliday);
router.delete('/holidays/:id', authorize('SuperAdmin'), ctrl.deleteHoliday);

module.exports = router;
