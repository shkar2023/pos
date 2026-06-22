const express = require('express');
const { query, getOne } = require('../../config/db');
const { requireRole } = require('../../middleware/auth');
const { genRef, num } = require('../../config/helpers');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { from, to, category, branch } = req.query;
    let sql = `SELECT e.*, c.name AS category_name, b.name AS branch_name, u.name AS user_name
      FROM expenses e LEFT JOIN expense_categories c ON c.id=e.category_id
      LEFT JOIN branches b ON b.id=e.branch_id LEFT JOIN users u ON u.id=e.user_id WHERE 1=1`;
    const params = [];
    if (from) { sql += ' AND e.expense_date >= ?'; params.push(from); }
    if (to) { sql += ' AND e.expense_date <= ?'; params.push(to); }
    if (category) { sql += ' AND e.category_id=?'; params.push(parseInt(category)); }
    if (branch) { sql += ' AND e.branch_id=?'; params.push(parseInt(branch)); }
    sql += ' ORDER BY e.id DESC LIMIT 300';
    res.json({ data: await query(sql, params) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/categories', async (req, res) => {
  res.json({ data: await query('SELECT * FROM expense_categories WHERE is_active=1 ORDER BY name') });
});

router.post('/', requireRole('admin','manager','accountant'), async (req, res) => {
  try {
    const b = req.body;
    const refNo = genRef('EXP');
    const r = await query('INSERT INTO expenses (ref_no, category_id, branch_id, user_id, amount, currency, expense_date, description) VALUES (?,?,?,?,?,?,?,?)',
      [refNo, b.category_id || null, b.branch_id || req.user.branch_id || 1, req.user.id, num(b.amount), b.currency || 'USD', b.expense_date, b.description || null]);
    res.json({ ok: true, id: r.insertId, ref_no: refNo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireRole('admin','manager'), async (req, res) => {
  try {
    await query('DELETE FROM expenses WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
