// Web (EJS) routes - server-rendered pages
const express = require('express');
const { query, getOne } = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const router = express.Router();

// Dashboard / home
router.get('/', requireAuth, (req, res) => {
  res.render('dashboard/index', { title: 'Dashboard', activeNav: 'dashboard' });
});

// POS Terminal
router.get('/pos', requireAuth, requireRole('admin','manager','cashier'), async (req, res) => {
  const categories = await query('SELECT * FROM categories WHERE is_active=1 ORDER BY name_en');
  const customers = await query('SELECT id, name, phone, outstanding_balance FROM customers WHERE is_active=1 ORDER BY id');
  const branches = await query('SELECT * FROM branches WHERE is_active=1');
  res.render('pos/index', { title: 'POS', activeNav: 'pos', layout: 'layouts/pos', categories, customers, branches });
});

// Products list
router.get('/products', requireAuth, async (req, res) => {
  res.render('products/index', { title: 'Products', activeNav: 'products' });
});

// Categories
router.get('/categories', requireAuth, async (req, res) => {
  res.render('categories/index', { title: 'Categories', activeNav: 'categories' });
});

// Inventory
router.get('/inventory', requireAuth, async (req, res) => {
  const branches = await query('SELECT * FROM branches WHERE is_active=1');
  res.render('inventory/index', { title: 'Inventory', activeNav: 'inventory', branches });
});

// Stock transfers
router.get('/stock-transfers', requireAuth, requireRole('admin','manager'), async (req, res) => {
  const branches = await query('SELECT * FROM branches WHERE is_active=1');
  res.render('inventory/transfers', { title: 'Stock Transfers', activeNav: 'stock_transfers', branches });
});

// Sales list
router.get('/sales', requireAuth, async (req, res) => {
  res.render('sales/index', { title: 'Sales', activeNav: 'sales' });
});

// Sale detail / invoice
router.get('/sales/:id', requireAuth, async (req, res) => {
  res.render('sales/show', { title: 'Invoice', activeNav: 'sales', saleId: req.params.id });
});

// Invoice print (no layout)
router.get('/sales/:id/print', requireAuth, async (req, res) => {
  res.render('sales/print', { layout: false, saleId: req.params.id, lang: req.lang, t: req.t, isRTL: ['ar','ku'].includes(req.lang) });
});

// Purchases
router.get('/purchases', requireAuth, requireRole('admin','manager','accountant'), async (req, res) => {
  const suppliers = await query('SELECT id, name FROM suppliers WHERE is_active=1 ORDER BY name');
  const branches = await query('SELECT * FROM branches WHERE is_active=1');
  res.render('purchases/index', { title: 'Purchases', activeNav: 'purchases', suppliers, branches });
});

// Customers
router.get('/customers', requireAuth, async (req, res) => {
  res.render('customers/index', { title: 'Customers', activeNav: 'customers' });
});

// Suppliers
router.get('/suppliers', requireAuth, requireRole('admin','manager','accountant'), async (req, res) => {
  res.render('suppliers/index', { title: 'Suppliers', activeNav: 'suppliers' });
});

// Expenses
router.get('/expenses', requireAuth, requireRole('admin','manager','accountant'), async (req, res) => {
  const categories = await query('SELECT * FROM expense_categories WHERE is_active=1');
  const branches = await query('SELECT * FROM branches WHERE is_active=1');
  res.render('expenses/index', { title: 'Expenses', activeNav: 'expenses', categories, branches });
});

// Reports hub
router.get('/reports', requireAuth, requireRole('admin','manager','accountant'), async (req, res) => {
  res.render('reports/index', { title: 'Reports', activeNav: 'reports' });
});

// Users management
router.get('/users', requireAuth, requireRole('admin','manager'), async (req, res) => {
  const branches = await query('SELECT * FROM branches WHERE is_active=1');
  res.render('users/index', { title: 'Users', activeNav: 'users', branches });
});

// Branches
router.get('/branches', requireAuth, requireRole('admin'), async (req, res) => {
  res.render('branches/index', { title: 'Branches', activeNav: 'branches' });
});

// Settings
router.get('/settings', requireAuth, requireRole('admin'), async (req, res) => {
  res.render('settings/index', { title: 'Settings', activeNav: 'settings' });
});

// Activity log
router.get('/activity', requireAuth, requireRole('admin','manager'), async (req, res) => {
  const logs = await query(`SELECT a.*, u.name AS user_name FROM activity_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200`);
  res.render('activity/index', { title: 'Activity Log', activeNav: 'activity', logs });
});

module.exports = router;
