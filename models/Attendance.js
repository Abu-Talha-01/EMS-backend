const { ObjectId } = require('mongodb');
const db = require('../config/db');

const col = () => db.getDb().collection('attendance');

const upsertAttendance = (employeeId, date, data) =>
    col().findOneAndUpdate(
        { employee: new ObjectId(employeeId), date },
        { $set: { ...data, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true, returnDocument: 'after' }
    );

const findByEmployeeAndDate = (employeeId, date) =>
    col().findOne({ employee: new ObjectId(employeeId), date });

const findByEmployee = (employeeId, from, to) =>
    col().find({
        employee: new ObjectId(employeeId),
        date: { $gte: from, $lte: to }
    }).sort({ date: -1 }).toArray();

const createIndexes = async () => {
    await col().createIndex({ employee: 1, date: 1 }, { unique: true });
    await col().createIndex({ date: 1 });
};

module.exports = { col, upsertAttendance, findByEmployeeAndDate, findByEmployee, createIndexes };
