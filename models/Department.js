const { ObjectId } = require('mongodb');
const db = require('../config/db');

const col = () => db.getDb().collection('departments');

const createDept = async (data) => {
    const dept = {
        name: data.name.trim(),
        code: data.code.toUpperCase().trim(),
        description: data.description || '',
        location: data.location || '',
        head: data.head ? new ObjectId(data.head) : null,
        parentDepartment: data.parentDepartment ? new ObjectId(data.parentDepartment) : null,
        isActive: true,
        budget: data.budget || 0,
        createdBy: data.createdBy ? new ObjectId(data.createdBy) : null,
        createdAt: new Date(), updatedAt: new Date(),
    };
    const result = await col().insertOne(dept);
    return { ...dept, _id: result.insertedId };
};

const findAll = (query = { isActive: true }) => col().find(query).toArray();
const findById = (id) => col().findOne({ _id: new ObjectId(id) });
const findByCode = (code) => col().findOne({ code: code.toUpperCase() });

const updateDept = (id, updates) =>
    col().findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { ...updates, updatedAt: new Date() } },
        { returnDocument: 'after' }
    );

const createIndexes = async () => {
    await col().createIndex({ name: 1 }, { unique: true });
    await col().createIndex({ code: 1 }, { unique: true });
};

module.exports = { col, createDept, findAll, findById, findByCode, updateDept, createIndexes };
