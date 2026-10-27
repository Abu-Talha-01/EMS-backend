const Role = require('../models/Role');

exports.getRoles = async (req, res, next) => {
    try {
        const roles = await Role.findAll();
        res.json({ roles });
    } catch (error) { next(error); }
};
