const { validationResult } = require('express-validator');
const Department = require('../models/Department');
const { createAuditLog } = require('../utils/auditHelper');
const db = require('../config/db');

exports.getAllDepartments = async (req, res, next) => {
    try {
        const departments = await Department.findAll({ isActive: true });
        const headcounts  = await db.getDb().collection('employees').aggregate([
            { $match: { status: 'active' } },
            { $group: { _id: '$professional.department', count: { $sum: 1 } } },
        ]).toArray();
        const hcMap = headcounts.reduce((acc, { _id, count }) => { acc[_id?.toString()] = count; return acc; }, {});
        const result = departments.map((d) => ({ ...d, headcount: hcMap[d._id.toString()] || 0 }));
        res.json({ departments: result });
    } catch (error) { next(error); }
};

exports.getDepartment = async (req, res, next) => {
    try {
        const department = await Department.findById(req.params.id);
        if (!department) return res.status(404).json({ error: 'Department not found' });
        const employees = await db.getDb().collection('employees').find({
            'professional.department': department._id, status: 'active',
        }).limit(20).toArray();
        res.json({ department, employees, headcount: employees.length });
    } catch (error) { next(error); }
};

exports.createDepartment = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        const existing = await Department.findByCode(req.body.code);
        if (existing) return res.status(409).json({ error: 'Department code already exists' });
        const department = await Department.createDept({ ...req.body, createdBy: req.user.id });
        await createAuditLog(req, 'CREATE', 'Department', department._id, { name: department.name });
        res.status(201).json({ message: 'Department created', department });
    } catch (error) { next(error); }
};

exports.updateDepartment = async (req, res, next) => {
    try {
        const department = await Department.updateDept(req.params.id, req.body);
        if (!department) return res.status(404).json({ error: 'Department not found' });
        await createAuditLog(req, 'UPDATE', 'Department', req.params.id, req.body);
        res.json({ message: 'Department updated', department });
    } catch (error) { next(error); }
};

exports.deleteDepartment = async (req, res, next) => {
    try {
        const headcount = await db.getDb().collection('employees').countDocuments({
            'professional.department': require('mongodb').ObjectId.createFromHexString(req.params.id),
            status: 'active',
        });
        if (headcount > 0) return res.status(400).json({ error: `Cannot delete: ${headcount} active employee(s) in this department.` });
        const department = await Department.updateDept(req.params.id, { isActive: false });
        await createAuditLog(req, 'DELETE', 'Department', req.params.id, {});
        res.json({ message: 'Department deactivated successfully' });
    } catch (error) { next(error); }
};
