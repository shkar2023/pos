// Aggregate API routes
const express = require('express');
const router = express.Router();

router.use('/products', require('./products'));
router.use('/categories', require('./categories'));
router.use('/customers', require('./customers'));
router.use('/suppliers', require('./suppliers'));
router.use('/sales', require('./sales'));
router.use('/purchases', require('./purchases'));
router.use('/expenses', require('./expenses'));
router.use('/inventory', require('./inventory'));
router.use('/branches', require('./branches'));
router.use('/users', require('./users'));
router.use('/settings', require('./settings'));
router.use('/reports', require('./reports'));
router.use('/dashboard', require('./dashboard'));

module.exports = router;
