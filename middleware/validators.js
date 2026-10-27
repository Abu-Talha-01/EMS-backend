const { body } = require('express-validator');

exports.validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password is required'),
];

exports.validateRegister = [
  body('name').trim().notEmpty().isLength({ min: 2, max: 100 }).withMessage('Name is required (2-100 chars)'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must be 8+ chars with uppercase, lowercase, and number'),
  body('role').optional().isIn(['SuperAdmin', 'Admin', 'HRManager', 'HR', 'Manager', 'Employee', 'Auditor']),
];

exports.validateSignup = [
  body('name').trim().notEmpty().isLength({ min: 2, max: 100 }).withMessage('Name is required (2-100 chars)'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must be 8+ chars with uppercase, lowercase, and number'),
  body('department').isMongoId().withMessage('Valid department ID required'),
  body('designation').optional().trim().isLength({ max: 100 }).withMessage('Designation must be 100 chars or fewer'),
];

exports.validateEmployee = [
  body('personal.firstName').trim().notEmpty().withMessage('First name is required'),
  body('personal.lastName').trim().notEmpty().withMessage('Last name is required'),
  body('professional.department').isMongoId().withMessage('Valid department ID required'),
  body('professional.designation').trim().notEmpty().withMessage('Designation is required'),
  body('professional.joiningDate').isISO8601().withMessage('Valid joining date required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
];

exports.validateDepartment = [
  body('name').trim().notEmpty().withMessage('Department name is required'),
  body('code')
    .trim()
    .notEmpty()
    .isLength({ max: 10 })
    .toUpperCase()
    .withMessage('Department code is required (max 10 chars)'),
];

exports.validateChangePassword = [
  body('currentPassword').notEmpty().withMessage('Current password required'),
  body('newPassword')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must be 8+ chars with uppercase, lowercase, and number'),
];
