const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employee.controller');
const { authenticate, authorize, authorizePermission } = require('../middleware/auth');
const { validateEmployee } = require('../middleware/validators');

router.use(authenticate);

router.get('/stats', authorizePermission('employees:read'), employeeController.getEmployeeStats);
router.get('/me', employeeController.getMyEmployee);
router.get('/', authorizePermission('employees:read'), employeeController.getAllEmployees);
router.get('/:id', employeeController.getEmployee);
router.post('/', authorizePermission('employees:create'), validateEmployee, employeeController.createEmployee);
router.patch('/:id', authorizePermission('employees:update'), employeeController.updateEmployee);
router.patch('/:id/activate', authorizePermission('employees:activate'), employeeController.activateEmployee);
router.patch('/:id/terminate', authorizePermission('employees:terminate'), employeeController.terminateEmployee);
router.delete('/:id', authorize('SuperAdmin'), employeeController.deleteEmployee);

module.exports = router;
