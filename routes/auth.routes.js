const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const {
  validateLogin,
  validateRegister,
  validateSignup,
  validateChangePassword,
} = require('../middleware/validators');

// Public routes
router.get('/signup-options', authController.getSignupOptions);
router.post('/signup', validateSignup, authController.signup);
router.post('/login', validateLogin, authController.login);
router.post('/refresh-token', authController.refreshToken);

// Protected routes
router.use(authenticate);

router.get('/me', authController.getMe);
router.post('/logout', authController.logout);
router.patch('/change-password', validateChangePassword, authController.changePassword);

// HR/Admin only - register new users
router.post(
  '/register',
  authorizeAdmin,
  validateRegister,
  authController.register
);

module.exports = router;
