const { ObjectId } = require('mongodb');
const db = require('../config/db');

const col = () => db.getDb().collection('employees');

const generateEmployeeId = async () => {
    const year = new Date().getFullYear();
    const count = await col().countDocuments();
    return `EMP-${year}-${String(count + 1).padStart(4, '0')}`;
};

const createEmployee = async (data) => {
    const employeeId = await generateEmployeeId();
    const employee = {
        employeeId,
        user: new ObjectId(data.user),
        personal: {
            firstName: data.personal?.firstName || '',
            lastName: data.personal?.lastName || '',
            dateOfBirth: data.personal?.dateOfBirth || null,
            gender: data.personal?.gender || null,
            bloodGroup: data.personal?.bloodGroup || null,
            phone: data.personal?.phone || null,
            address: data.personal?.address || {},
            emergencyContact: data.personal?.emergencyContact || {},
        },
        professional: {
            department: data.professional?.department ? new ObjectId(data.professional.department) : null,
            designation: data.professional?.designation || '',
            employmentType: data.professional?.employmentType || 'Full-Time',
            workLocation: data.professional?.workLocation || 'On-Site',
            joiningDate: data.professional?.joiningDate ? new Date(data.professional.joiningDate) : new Date(),
            probationEndDate: data.professional?.probationEndDate || null,
            confirmationDate: data.professional?.confirmationDate || null,
            reportingManager: data.professional?.reportingManager
                ? new ObjectId(data.professional.reportingManager) : null,
            skills: data.professional?.skills || [],
            experience: data.professional?.experience || 0,
        },
        salary: {
            ctc: data.salary?.ctc || 0,
            basic: data.salary?.basic || 0,
            hra: data.salary?.hra || 0,
            allowances: { travel: 0, medical: 0, other: 0, ...data.salary?.allowances },
            bankName: data.salary?.bankName || null,
            panNumber: data.salary?.panNumber || null,
        },
        documents: [],
        status: 'active',
        terminationDate: null,
        terminationReason: null,
        createdBy: data.createdBy ? new ObjectId(data.createdBy) : null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    const result = await col().insertOne(employee);
    return { ...employee, _id: result.insertedId };
};

const withDetailsPipeline = (match) => [
    { $match: match },
    { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'user' } },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'departments', localField: 'professional.department', foreignField: '_id', as: 'department' } },
    { $lookup: { from: 'employees', localField: 'professional.reportingManager', foreignField: '_id', as: 'reportingManager' } },
    {
        $addFields: {
            'professional.department': { $arrayElemAt: ['$department', 0] },
            'professional.reportingManager': { $arrayElemAt: ['$reportingManager', 0] },
        },
    },
    { $project: { 'user.password': 0, 'user.refreshToken': 0, department: 0, reportingManager: 0 } },
];

const findById = (id) =>
    col().findOne({ _id: new ObjectId(id) });

const findByIdWithDetails = async (id) => {
    const [employee] = await col().aggregate(withDetailsPipeline({ _id: new ObjectId(id) })).toArray();
    return employee || null;
};

const findByUserId = (userId) =>
    col().findOne({ user: new ObjectId(userId) });

const findAll = async ({ status, department, search, employmentType, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' }) => {
    const query = {};
    if (status) query.status = status;
    if (department) query['professional.department'] = new ObjectId(department);
    if (employmentType) query['professional.employmentType'] = employmentType;
    if (search) {
        query.$or = [
            { 'personal.firstName': { $regex: search, $options: 'i' } },
            { 'personal.lastName': { $regex: search, $options: 'i' } },
            { employeeId: { $regex: search, $options: 'i' } },
            { 'professional.designation': { $regex: search, $options: 'i' } },
        ];
    }
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [employees, total] = await Promise.all([
        col().aggregate([
            ...withDetailsPipeline(query),
            { $sort: sort },
            { $skip: skip },
            { $limit: parseInt(limit) },
        ]).toArray(),
        col().countDocuments(query),
    ]);
    return { employees, total };
};

const normalizeUpdates = (updates) => {
    const next = { ...updates };
    if (next.professional) {
        next.professional = { ...next.professional };
        if (next.professional.department) next.professional.department = new ObjectId(next.professional.department);
        if (next.professional.reportingManager) next.professional.reportingManager = new ObjectId(next.professional.reportingManager);
        if (next.professional.reportingManager === '') next.professional.reportingManager = null;
        if (next.professional.joiningDate) next.professional.joiningDate = new Date(next.professional.joiningDate);
    }
    if (next.personal?.dateOfBirth) next.personal = { ...next.personal, dateOfBirth: new Date(next.personal.dateOfBirth) };
    if (next.updatedBy) next.updatedBy = new ObjectId(next.updatedBy);
    return next;
};

const updateEmployee = (id, updates) =>
    col().findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { ...normalizeUpdates(updates), updatedAt: new Date() } },
        { returnDocument: 'after' }
    );

const deleteEmployee = (id) =>
    col().deleteOne({ _id: new ObjectId(id) });

const createIndexes = async () => {
    await col().createIndex({ 'professional.department': 1 });
    await col().createIndex({ status: 1 });
    await col().createIndex({ employeeId: 1 }, { unique: true });
    await col().createIndex({ user: 1 }, { unique: true });
};

module.exports = { col, createEmployee, findById, findByIdWithDetails, findByUserId, findAll, updateEmployee, deleteEmployee, createIndexes };
