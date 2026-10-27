const bcrypt = require('bcryptjs');
const Role = require('../models/Role');

const departments = [
    { name: 'Engineering', code: 'ENG', description: 'Software Development', location: 'Block A', isActive: true, budget: 0, createdAt: new Date() },
    { name: 'Human Resources', code: 'HR', description: 'People Operations', location: 'Block B', isActive: true, budget: 0, createdAt: new Date() },
    { name: 'Finance', code: 'FIN', description: 'Finance & Accounting', location: 'Block B', isActive: true, budget: 0, createdAt: new Date() },
    { name: 'Marketing', code: 'MKT', description: 'Brand & Growth', location: 'Block C', isActive: true, budget: 0, createdAt: new Date() },
    { name: 'Operations', code: 'OPS', description: 'Business Operations', location: 'Block A', isActive: true, budget: 0, createdAt: new Date() },
];

const leavePolicies = [
    { leaveType: 'casual', name: 'Casual Leave', code: 'CL', daysAllowed: 12, isPaid: true, requiresApproval: true, minNoticeDays: 1, maxConsecutiveDays: 30, carryForward: false, isActive: true },
    { leaveType: 'sick', name: 'Sick Leave', code: 'SL', daysAllowed: 10, isPaid: true, requiresApproval: false, minNoticeDays: 0, maxConsecutiveDays: 30, carryForward: false, isActive: true },
    { leaveType: 'earned', name: 'Earned Leave', code: 'EL', daysAllowed: 15, isPaid: true, requiresApproval: true, minNoticeDays: 3, maxConsecutiveDays: 30, carryForward: true, maxCarryForward: 10, isActive: true },
    { leaveType: 'maternity', name: 'Maternity Leave', code: 'ML', daysAllowed: 180, isPaid: true, requiresApproval: true, minNoticeDays: 0, maxConsecutiveDays: 180, applicableGender: 'Female', isActive: true },
    { leaveType: 'paternity', name: 'Paternity Leave', code: 'PL', daysAllowed: 15, isPaid: true, requiresApproval: true, minNoticeDays: 0, maxConsecutiveDays: 15, isActive: true },
    { leaveType: 'comp_off', name: 'Compensatory Off', code: 'CO', daysAllowed: 5, isPaid: true, requiresApproval: true, minNoticeDays: 0, maxConsecutiveDays: 5, isActive: true },
    { leaveType: 'unpaid', name: 'Leave Without Pay', code: 'LWP', daysAllowed: 30, isPaid: false, requiresApproval: true, minNoticeDays: 0, maxConsecutiveDays: 30, isActive: true },
];

const shifts = [
    { name: 'General', code: 'GEN', startTime: '09:00', endTime: '18:00', graceMinutes: 15, workingHours: 8, isNightShift: false, weeklyOffs: ['Saturday', 'Sunday'], isActive: true, createdAt: new Date() },
    { name: 'Morning', code: 'MRN', startTime: '06:00', endTime: '14:00', graceMinutes: 10, workingHours: 8, isNightShift: false, weeklyOffs: ['Sunday'], isActive: true, createdAt: new Date() },
];

const holidays = (year) => [
    { name: "New Year's Day", date: new Date(`${year}-01-01`), type: 'national', year },
    { name: 'Republic Day', date: new Date(`${year}-01-26`), type: 'national', year },
    { name: 'Holi', date: new Date(`${year}-03-14`), type: 'national', year },
    { name: 'Independence Day', date: new Date(`${year}-08-15`), type: 'national', year },
    { name: 'Diwali', date: new Date(`${year}-10-20`), type: 'national', year },
    { name: 'Christmas', date: new Date(`${year}-12-25`), type: 'national', year },
];

const defaultUsers = [
    { name: 'Super Admin', email: 'admin@ems.com', password: 'Admin@12345', role: 'SuperAdmin', departmentIndex: 1, designation: 'Administrator' },
    { name: 'Priya Sharma', email: 'hr@ems.com', password: 'HR@123456', role: 'HRManager', departmentIndex: 1, designation: 'HR Manager' },
    { name: 'Arjun Mehta', email: 'manager@ems.com', password: 'Manager@123', role: 'Manager', departmentIndex: 0, designation: 'Engineering Manager' },
    { name: 'Rahul Singh', email: 'rahul@ems.com', password: 'Emp@12345', role: 'Employee', departmentIndex: 0, designation: 'Senior Developer' },
    { name: 'Aisha Khan', email: 'aisha@ems.com', password: 'Emp@12345', role: 'Employee', departmentIndex: 0, designation: 'Frontend Developer' },
    { name: 'Vikram Nair', email: 'vikram@ems.com', password: 'Emp@12345', role: 'Employee', departmentIndex: 3, designation: 'Marketing Analyst' },
];

const buildEmployee = async (db, userId, user, departmentId) => {
    const [firstName, ...rest] = user.name.trim().split(' ');
    const employeeId = `EMP-${new Date().getFullYear()}-${String(await db.collection('employees').countDocuments() + 1).padStart(4, '0')}`;
    const employee = {
        employeeId,
        user: userId,
        personal: {
            firstName,
            lastName: rest.join(' ') || '-',
            gender: null,
            phone: null,
            address: { city: null },
        },
        professional: {
            department: departmentId,
            designation: user.designation,
            employmentType: 'Full-Time',
            workLocation: 'On-Site',
            joiningDate: new Date('2022-01-15'),
            reportingManager: null,
            skills: [],
            experience: 0,
        },
        salary: {
            ctc: 1200000,
            basic: 600000,
            hra: 200000,
            allowances: { travel: 0, medical: 0, other: 0 },
        },
        status: 'active',
        documents: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    await db.collection('employees').insertOne(employee);
    await db.collection('users').updateOne({ _id: userId }, { $set: { employeeId } });
};

const createIndexes = async (db) => {
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('employees').createIndex({ employeeId: 1 }, { unique: true });
    await db.collection('employees').createIndex({ user: 1 }, { unique: true });
    await db.collection('attendance').createIndex({ employee: 1, date: 1 }, { unique: true });
    await db.collection('leave_balances').createIndex({ employee: 1, year: 1 }, { unique: true });
    await db.collection('departments').createIndex({ code: 1 }, { unique: true });
    await db.collection('roles').createIndex({ name: 1 }, { unique: true });
};

const seedDatabase = async (db, { reset = false } = {}) => {
    if (reset) {
        const collections = ['users', 'employees', 'departments', 'roles', 'shifts', 'leave_policies', 'holidays', 'attendance', 'leave_requests', 'leave_balances', 'audit_logs'];
        for (const name of collections) {
            await db.collection(name).drop().catch(() => { });
        }
    }

    const existingUsers = await db.collection('users').countDocuments();
    if (!reset && existingUsers > 0) {
        return false;
    }

    await Role.seedRoles(db);
    const insertedDepts = await db.collection('departments').insertMany(departments);
    const deptIds = Object.values(insertedDepts.insertedIds);

    for (const userDef of defaultUsers) {
        const hashed = await bcrypt.hash(userDef.password, 12);
        const userResult = await db.collection('users').insertOne({
            name: userDef.name,
            email: userDef.email.toLowerCase(),
            password: hashed,
            role: userDef.role,
            isActive: true,
            loginAttempts: 0,
            lockUntil: null,
            lastLogin: null,
            refreshToken: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        const departmentId = deptIds[userDef.departmentIndex] || deptIds[0];
        await buildEmployee(db, userResult.insertedId, userDef, departmentId);
    }

    await db.collection('shifts').insertMany(shifts);
    await db.collection('leave_policies').insertMany(leavePolicies);
    await db.collection('holidays').insertMany(holidays(new Date().getFullYear()));
    await createIndexes(db);

    return true;
};

const ensureSeedData = async (db) => {
    await Role.seedRoles(db);
    const usersCount = await db.collection('users').countDocuments();
    if (usersCount === 0) {
        await seedDatabase(db, { reset: false });
        return true;
    }
    return false;
};

module.exports = {
    seedDatabase,
    ensureSeedData,
};
