const { ObjectId } = require('mongodb');
const db = require('../config/db');

const ROLE_DEFINITIONS = [
    {
        name: 'SuperAdmin',
        label: 'Super Admin',
        level: 100,
        permissions: ['*'],
        isSystem: true,
    },
    {
        name: 'Admin',
        label: 'Admin',
        level: 90,
        permissions: [
            'employees:read',
            'employees:create',
            'employees:update',
            'employees:activate',
            'employees:terminate',
            'attendance:manage',
            'leave:approve',
            'leave:read_all',
            'departments:manage',
        ],
        isSystem: true,
    },
    {
        name: 'HRManager',
        label: 'HR Manager',
        level: 80,
        aliases: ['HR'],
        permissions: [
            'employees:read',
            'employees:create',
            'employees:update',
            'employees:activate',
            'employees:terminate',
            'attendance:manage',
            'leave:approve',
            'leave:read_all',
            'departments:manage',
        ],
        isSystem: true,
    },
    {
        name: 'Manager',
        label: 'Manager',
        level: 60,
        permissions: ['employees:read', 'attendance:read_team', 'leave:approve'],
        isSystem: true,
    },
    {
        name: 'Auditor',
        label: 'Auditor',
        level: 40,
        permissions: ['employees:read', 'attendance:read_all', 'leave:read_all'],
        isSystem: true,
    },
    {
        name: 'Employee',
        label: 'Employee',
        level: 10,
        permissions: ['profile:read_self', 'attendance:self', 'leave:self'],
        isSystem: true,
    },
];

const ROLE_ALIASES = ROLE_DEFINITIONS.reduce((acc, role) => {
    acc[role.name] = role.name;
    (role.aliases || []).forEach((alias) => { acc[alias] = role.name; });
    return acc;
}, {});

const ADMIN_ROLES = ['SuperAdmin', 'Admin', 'HRManager', 'HR'];
const PEOPLE_MANAGER_ROLES = [...ADMIN_ROLES, 'Manager'];

const col = () => db.getDb().collection('roles');

const normalizeRole = (role = 'Employee') => ROLE_ALIASES[role] || role;
const roleMatches = (actual, allowed) => allowed.includes(actual) || allowed.includes(normalizeRole(actual));
const isAdminRole = (role) => ADMIN_ROLES.includes(role) || ADMIN_ROLES.includes(normalizeRole(role));
const canReadEmployees = (role) => PEOPLE_MANAGER_ROLES.includes(role) || PEOPLE_MANAGER_ROLES.includes(normalizeRole(role));

const seedRoles = async (database = db.getDb()) => {
    const roles = database.collection('roles');
    for (const role of ROLE_DEFINITIONS) {
        await roles.updateOne(
            { name: role.name },
            {
                $set: { ...role, updatedAt: new Date() },
                $setOnInsert: { createdAt: new Date(), isActive: true },
            },
            { upsert: true }
        );
    }
};

const findAll = () => col().find({ isActive: { $ne: false } }).sort({ level: -1 }).toArray();
const findByName = (name) => col().findOne({ name: normalizeRole(name), isActive: { $ne: false } });
const findById = (id) => col().findOne({ _id: new ObjectId(id) });

const createIndexes = async () => {
    await col().createIndex({ name: 1 }, { unique: true });
    await col().createIndex({ level: -1 });
};

module.exports = {
    col,
    ROLE_DEFINITIONS,
    ADMIN_ROLES,
    PEOPLE_MANAGER_ROLES,
    normalizeRole,
    roleMatches,
    isAdminRole,
    canReadEmployees,
    seedRoles,
    findAll,
    findByName,
    findById,
    createIndexes,
};
