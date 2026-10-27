const { ObjectId } = require('mongodb');
const db = require('../config/db');

const col = () => db.getDb().collection('holidays');

const findByYear  = (year) => col().find({ year: parseInt(year) }).sort({ date: 1 }).toArray();
const findInRange = (from, to) => col().find({ date: { $gte: from, $lte: to } }).toArray();

const createHoliday = async (data) => {
    const holiday = { ...data, date: new Date(data.date), year: new Date(data.date).getFullYear(), createdAt: new Date() };
    const result  = await col().insertOne(holiday);
    return { ...holiday, _id: result.insertedId };
};

const deleteHoliday = (id) => col().deleteOne({ _id: new ObjectId(id) });

const createIndexes = async () => {
    await col().createIndex({ date: 1 }, { unique: true });
    await col().createIndex({ year: 1 });
};

module.exports = { col, findByYear, findInRange, createHoliday, deleteHoliday, createIndexes };
