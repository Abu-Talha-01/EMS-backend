const { ObjectId } = require('mongodb');
const db = require('../config/db');

const col = () => db.getDb().collection('leave_policies');

const findAll    = () => col().find({ isActive: true }).toArray();
const findByType = (leaveType) => col().findOne({ leaveType, isActive: true });
const findById   = (id) => col().findOne({ _id: new ObjectId(id) });

const createPolicy = async (data) => {
    const result = await col().insertOne({ ...data, isActive: true, createdAt: new Date() });
    return col().findOne({ _id: result.insertedId });
};

const updatePolicy = (id, updates) =>
    col().findOneAndUpdate({ _id: new ObjectId(id) }, { $set: updates }, { returnDocument: 'after' });

module.exports = { col, findAll, findByType, findById, createPolicy, updatePolicy };
