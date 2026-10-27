const { ObjectId } = require('mongodb');
const db = require('../config/db');

const col = () => db.getDb().collection('leave_balances');

const findByEmployeeYear = (employeeId, year) =>
    col().findOne({ employee: new ObjectId(employeeId), year: parseInt(year) });

const createBalance = async (employeeId, year, balances) => {
    const doc = { employee: new ObjectId(employeeId), year: parseInt(year), balances, createdAt: new Date(), updatedAt: new Date() };
    const result = await col().insertOne(doc);
    return { ...doc, _id: result.insertedId };
};

const updateBalance = (employeeId, year, balances) =>
    col().findOneAndUpdate(
        { employee: new ObjectId(employeeId), year: parseInt(year) },
        { $set: { balances, updatedAt: new Date() } },
        { returnDocument: 'after' }
    );

const createIndexes = async () => {
    await col().createIndex({ employee: 1, year: 1 }, { unique: true });
};

module.exports = { col, findByEmployeeYear, createBalance, updateBalance, createIndexes };
