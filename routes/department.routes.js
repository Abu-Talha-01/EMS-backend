const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/department.controller');
const { authenticate, authorize, authorizePermission } = require('../middleware/auth');
const { validateDepartment } = require('../middleware/validators');

router.use(authenticate);

router.get('/', departmentController.getAllDepartments);
router.get('/:id', departmentController.getDepartment);
router.post('/', authorizePermission('departments:manage'), validateDepartment, departmentController.createDepartment);
router.patch('/:id', authorizePermission('departments:manage'), departmentController.updateDepartment);
router.delete('/:id', authorize('SuperAdmin'), departmentController.deleteDepartment);

module.exports = router;
