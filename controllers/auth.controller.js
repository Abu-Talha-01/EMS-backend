const { validationResult } = require('express-validator');
const User     = require('../models/User');
const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Role = require('../models/Role');
const { generateTokenPair, verifyRefreshToken } = require('../services/tokenService');
const { createAuditLog } = require('../utils/auditHelper');
const logger   = require('../config/logger');

const createEmployeeProfile = async ({ user, name, role, department, designation, joiningDate, createdBy = null }) => {
    const dept = await Department.findById(department);
    if (!dept) {
        const error = new Error('Department not found');
        error.statusCode = 404;
        throw error;
    }

    const [firstName, ...rest] = name.trim().split(' ');
    const employee = await Employee.createEmployee({
        user: user._id,
        personal: { firstName, lastName: rest.join(' ') || '-' },
        professional: {
            department,
            designation: designation || role,
            joiningDate: joiningDate || new Date(),
        },
        createdBy,
    });
    await User.updateUser(user._id, { employeeId: employee.employeeId });
    return employee;
};

exports.register = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { name, email, password, role = 'Employee', department, designation, joiningDate } = req.body;
        const normalizedRole = Role.normalizeRole(role);
        const roleDoc = await Role.findByName(normalizedRole);
        if (!roleDoc) return res.status(400).json({ error: 'Invalid role' });
        if (normalizedRole === 'SuperAdmin' && req.user.role !== 'SuperAdmin')
            return res.status(403).json({ error: 'Only SuperAdmin can create another SuperAdmin' });

        let employee = null;
        if (normalizedRole !== 'SuperAdmin') {
            const dept = await Department.findById(department);
            if (!dept) return res.status(404).json({ error: 'Department not found' });
        }

        const existing = await User.findByEmail(email);
        if (existing) return res.status(409).json({ error: 'Email already registered' });

        const user = await User.createUser({ name, email, password, role: normalizedRole });

        if (normalizedRole !== 'SuperAdmin') {
            employee = await createEmployeeProfile({
                user,
                name,
                role: normalizedRole,
                department,
                designation,
                joiningDate,
                createdBy: req.user?.id,
            });
        }

        await createAuditLog(req, 'CREATE', 'User', user._id, { email, role: normalizedRole });
        const { accessToken, refreshToken } = generateTokenPair(user);
        await User.updateUser(user._id, { refreshToken });

        res.status(201).json({
            message: 'User registered successfully',
            accessToken, refreshToken,
            user: { id: user._id, name: user.name, email: user.email, role: user.role, employeeId: employee?.employeeId },
        });
    } catch (error) { next(error); }
};

exports.signup = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { name, email, password, department, designation, joiningDate } = req.body;
        const role = 'Employee';

        const existing = await User.findByEmail(email);
        if (existing) return res.status(409).json({ error: 'Email already registered' });

        const roleDoc = await Role.findByName(role);
        if (!roleDoc) return res.status(500).json({ error: 'Employee role is not configured' });

        const dept = await Department.findById(department);
        if (!dept || dept.isActive === false) return res.status(404).json({ error: 'Department not found' });

        const user = await User.createUser({ name, email, password, role });
        const employee = await createEmployeeProfile({
            user,
            name,
            role,
            department,
            designation: designation || 'Employee',
            joiningDate,
        });

        await createAuditLog(req, 'SIGNUP', 'User', user._id, { email, role });
        const { accessToken, refreshToken } = generateTokenPair(user);
        await User.updateUser(user._id, { refreshToken });

        res.status(201).json({
            message: 'Signup successful',
            accessToken,
            refreshToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role,
                employeeId: employee.employeeId,
            },
            employee,
        });
    } catch (error) { next(error); }
};

exports.getSignupOptions = async (req, res, next) => {
    try {
        const departments = await Department.findAll({ isActive: true });
        res.json({
            roles: [{ name: 'Employee', label: 'Employee' }],
            departments: departments.map(({ _id, name, code }) => ({ _id, name, code })),
        });
    } catch (error) { next(error); }
};

exports.login = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { email, password } = req.body;
        const user = await User.findByEmail(email, true); // include password
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        if (User.isLocked(user)) return res.status(423).json({ error: 'Account temporarily locked. Try again in 30 minutes.' });
        if (!user.isActive)      return res.status(403).json({ error: 'Account deactivated. Contact HR.' });

        const isMatch = await User.comparePassword(password, user.password);
        if (!isMatch) {
            await User.incLoginAttempts(user._id);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        await User.resetLoginAttempts(user._id);
        const { accessToken, refreshToken } = generateTokenPair(user);
        await User.updateUser(user._id, { refreshToken });

        const employee = await Employee.findByUserId(user._id);
        await createAuditLog(req, 'LOGIN', 'User', user._id, { email });
        logger.info(`User logged in: ${email}`);

        res.json({
            accessToken, refreshToken,
            user: { id: user._id, name: user.name, email: user.email, role: user.role, employeeId: user.employeeId, employee: employee || null },
        });
    } catch (error) { next(error); }
};

exports.refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

        let decoded;
        try { decoded = verifyRefreshToken(refreshToken); }
        catch { return res.status(401).json({ error: 'Invalid or expired refresh token' }); }

        const user = await User.findById(decoded.id, { refreshToken: 1, isActive: 1, name: 1, email: 1, role: 1 });
        if (!user || user.refreshToken !== refreshToken) return res.status(401).json({ error: 'Token mismatch. Please login again.' });

        const tokens = generateTokenPair(user);
        await User.updateUser(user._id, { refreshToken: tokens.refreshToken });
        res.json(tokens);
    } catch (error) { next(error); }
};

exports.logout = async (req, res, next) => {
    try {
        await User.updateUser(req.user.id, { refreshToken: null });
        await createAuditLog(req, 'LOGOUT', 'User', req.user.id, {});
        res.json({ message: 'Logged out successfully' });
    } catch (error) { next(error); }
};

exports.getMe = async (req, res, next) => {
    try {
        const user     = await User.findById(req.user.id);
        const employee = await Employee.findByUserId(req.user.id);
        res.json({ user, employee });
    } catch (error) { next(error); }
};

exports.changePassword = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        const { currentPassword, newPassword } = req.body;
        const user = await User.findByEmail(req.user.email, true);
        const isMatch = await User.comparePassword(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Current password is incorrect' });
        const bcrypt = require('bcryptjs');
        const hashed = await bcrypt.hash(newPassword, 12);
        await User.updateUser(req.user.id, { password: hashed, passwordChangedAt: new Date() });
        res.json({ message: 'Password changed successfully' });
    } catch (error) { next(error); }
};
