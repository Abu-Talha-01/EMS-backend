const { ObjectId } = require('mongodb');
const db = require('../config/db');

const col = () => db.getDb().collection('shifts');

const findActive = () => col().findOne({ isActive: true });
const findAll    = () => col().find({ isActive: true }).toArray();

const createShift = async (data) => {
    const shift = { ...data, isActive: true, createdAt: new Date() };
    const result = await col().insertOne(shift);
    return { ...shift, _id: result.insertedId };
};

const updateShift = (id, updates) =>
    col().findOneAndUpdate({ _id: new ObjectId(id) }, { $set: updates }, { returnDocument: 'after' });

module.exports = { col, findActive, findAll, createShift, updateShift };
