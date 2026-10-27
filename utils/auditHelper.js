const AuditLog = require('../models/AuditLog');
const logger   = require('../config/logger');

const createAuditLog = async (req, action, resource, resourceId, details = {}) => {
    try {
        await AuditLog.createLog({
            user: req.user?.id,
            action,
            resource,
            resourceId,
            details,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        });
    } catch (err) {
        logger.error(`Audit log failed: ${err.message}`);
    }
};

module.exports = { createAuditLog };
