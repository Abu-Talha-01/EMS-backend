const { ObjectId } = require('mongodb');
const db = require('../config/db');

const col = () => db.getDb().collection('leave_requests');

const createRequest = async (data) => {
    const doc = {
        ...data,
        employee: new ObjectId(data.employee),
        status: 'pending',
        currentApprovalLevel: 1,
        attendanceRecordsCreated: false,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    const result = await col().insertOne(doc);
    return { ...doc, _id: result.insertedId };
};

const findById     = (id)         => col().findOne({ _id: new ObjectId(id) });
const findByEmployee = (employeeId, query = {}) =>
    col().find({ employee: new ObjectId(employeeId), ...query }).sort({ createdAt: -1 }).toArray();

const updateRequest = (id, updates) =>
    col().findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { ...updates, updatedAt: new Date() } },
        { returnDocument: 'after' }
    );

const findPendingForApprover = (approverId) =>
    col().find({
        status: 'pending',
        approvalChain: { $elemMatch: { approver: new ObjectId(approverId), action: 'pending' } }
    }).toArray();

const createIndexes = async () => {
    await col().createIndex({ employee: 1, status: 1 });
    await col().createIndex({ from: 1, to: 1 });
};

module.exports = { col, createRequest, findById, findByEmployee, updateRequest, findPendingForApprover, createIndexes };
