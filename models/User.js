const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const db = require('../config/db');
const Role = require('./Role');

const ROLES = ['SuperAdmin', 'Admin', 'HRManager', 'HR', 'Manager', 'Employee', 'Auditor'];

const col = () => db.getDb().collection('users');

const createUser = async ({ name, email, password, role = 'Employee', employeeId = null }) => {
    const hashedPassword = await bcrypt.hash(password, 12);
    const normalizedRole = Role.normalizeRole(role);
    const user = {
        name, email: email.toLowerCase().trim(), password: hashedPassword,
        role: normalizedRole, employeeId, isActive: true, profilePhoto: null,
        loginAttempts: 0, lockUntil: null, lastLogin: null,
        refreshToken: null, passwordChangedAt: null,
        createdAt: new Date(), updatedAt: new Date(),
    };
    const result = await col().insertOne(user);
    return { ...user, _id: result.insertedId };
};

const findByEmail = (email, includePassword = false) =>
    col().findOne(
        { email: email.toLowerCase().trim() },
        { projection: includePassword ? {} : { password: 0 } }
    );

const findById = (id, projection = { password: 0 }) =>
    col().findOne({ _id: new ObjectId(id) }, { projection });

const comparePassword = (candidate, hashed) => bcrypt.compare(candidate, hashed);

const updateUser = (id, updates) =>
    col().findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { ...updates, ...(updates.role ? { role: Role.normalizeRole(updates.role) } : {}), updatedAt: new Date() } },
        { returnDocument: 'after', projection: { password: 0 } }
    );

const deleteUser = (id) =>
    col().deleteOne({ _id: new ObjectId(id) });

const LOCK_TIME = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const incLoginAttempts = async (id) => {
    const user = await findById(id, { loginAttempts: 1, lockUntil: 1 });
    if (user.lockUntil && user.lockUntil < new Date()) {
        return col().updateOne({ _id: new ObjectId(id) }, { $set: { loginAttempts: 1, lockUntil: null } });
    }
    const updates = { $inc: { loginAttempts: 1 } };
    if ((user.loginAttempts || 0) + 1 >= MAX_ATTEMPTS) {
        updates.$set = { lockUntil: new Date(Date.now() + LOCK_TIME) };
    }
    return col().updateOne({ _id: new ObjectId(id) }, updates);
};

const resetLoginAttempts = (id) =>
    col().updateOne({ _id: new ObjectId(id) }, { $set: { loginAttempts: 0, lastLogin: new Date(), lockUntil: null } });

const isLocked = (user) => !!(user.lockUntil && user.lockUntil > new Date());

const createIndexes = async () => {
    await col().createIndex({ email: 1 }, { unique: true });
    await col().createIndex({ employeeId: 1 }, { sparse: true });
    await col().createIndex({ role: 1 });
};

module.exports = { col, createUser, findByEmail, findById, comparePassword, updateUser, deleteUser, incLoginAttempts, resetLoginAttempts, isLocked, createIndexes, ROLES };
