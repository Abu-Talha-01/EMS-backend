const { verifyAccessToken } = require('../services/tokenService');
const User = require('../models/User');
const Role = require('../models/Role');
const logger = require('../config/logger');

const ROLE_HIERARCHY = { SuperAdmin: 100, Admin: 90, HRManager: 80, HR: 80, Manager: 60, Auditor: 40, Employee: 10 };

const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication token required' });

        const token = authHeader.split(' ')[1];
        let decoded;
        try { decoded = verifyAccessToken(token); }
        catch (err) {
            if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
            return res.status(401).json({ error: 'Invalid token' });
        }

        const user = await User.findById(decoded.id, { isActive: 1, email: 1, role: 1, name: 1 });
        if (!user || !user.isActive) return res.status(401).json({ error: 'User not found or deactivated' });

        req.user = { id: user._id.toString(), email: user.email, role: user.role, roleName: Role.normalizeRole(user.role), name: user.name };
        next();
    } catch (error) {
        logger.error(`Auth middleware error: ${error.message}`);
        next(error);
    }
};

const authorize = (...roles) => (req, res, next) => {
    if (!Role.roleMatches(req.user.role, roles))
        return res.status(403).json({ error: `Access denied. Required: ${roles.join(', ')}. Yours: ${req.user.role}` });
    next();
};

const authorizePermission = (...permissions) => async (req, res, next) => {
    try {
        const role = await Role.findByName(req.user.role);
        const rolePermissions = role?.permissions || [];
        const hasWildcard = rolePermissions.includes('*');
        const hasPermission = permissions.some((permission) => rolePermissions.includes(permission));

        if (!hasWildcard && !hasPermission) {
            return res.status(403).json({ error: `Access denied. Required permission: ${permissions.join(', ')}` });
        }

        next();
    } catch (error) {
        next(error);
    }
};

const authorizeMinRole = (minRole) => (req, res, next) => {
    if ((ROLE_HIERARCHY[req.user.roleName] || ROLE_HIERARCHY[req.user.role] || 0) < (ROLE_HIERARCHY[minRole] || 0))
        return res.status(403).json({ error: `Minimum required role: ${minRole}` });
    next();
};

const authorizeAdmin = (req, res, next) => {
    if (!Role.isAdminRole(req.user.role)) return res.status(403).json({ error: 'Admin access required' });
    next();
};

const authorizePeopleManager = (req, res, next) => {
    if (!Role.canReadEmployees(req.user.role)) return res.status(403).json({ error: 'People manager access required' });
    next();
};

module.exports = { authenticate, authorize, authorizePermission, authorizeMinRole, authorizeAdmin, authorizePeopleManager };
