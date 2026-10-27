const { ObjectId } = require('mongodb');
const db = require('../config/db');

const col = () => db.getDb().collection('audit_logs');

const createLog = (data) =>
    col().insertOne({ ...data, timestamp: new Date() });

module.exports = { col, createLog };
