const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/leave.controller');
const { authenticate, authorizePermission } = require('../middleware/auth');
const { body } = require('express-validator');

const validateLeave = [
  body('leaveType').isIn(['casual','sick','earned','maternity','paternity','comp_off','bereavement','unpaid']),
  body('from').isISO8601().withMessage('Valid from date required'),
  body('to').isISO8601().withMessage('Valid to date required'),
  body('reason').trim().notEmpty().withMessage('Reason is required'),
];

router.use(authenticate);

// Employee
router.post('/',              validateLeave, ctrl.applyLeave);
router.get('/my',             ctrl.getMyLeaves);
router.get('/balance',        ctrl.getLeaveBalance);
router.patch('/:id/cancel',   ctrl.cancelLeave);

// Manager/HR
router.get('/pending',        authorizePermission('leave:approve'), ctrl.getPendingApprovals);
router.patch('/:id/action',   authorizePermission('leave:approve'), ctrl.actionOnLeave);

// HR/Admin
router.get('/',               authorizePermission('leave:read_all'), ctrl.getAllLeaves);
router.get('/policies',       ctrl.getPolicies);
router.post('/policies',      authorizePermission('leave:read_all'), ctrl.createPolicy);
router.patch('/policies/:id', authorizePermission('leave:read_all'), ctrl.updatePolicy);

module.exports = router;
