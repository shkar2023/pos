const express = require('express');
const { query, getOne } = require('../../config/db');
const { requireRole } = require('../../middleware/auth');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    let sql = 'SELECT * FROM customers WHERE 1=1';
    const params = [];
    if (search) { sql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)'; const s=`%${search}%`; params.push(s,s,s); }
    sql += ' ORDER BY id DESC LIMIT 200';
    res.json({ data: await query(sql, params) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const c = await getOne('SELECT * FROM customers WHERE id=?', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'not_found' });
    const sales = await query('SELECT id, invoice_no, sale_date, total, payment_status FROM sales WHERE customer_id=? ORDER BY id DESC LIMIT 50', [req.params.id]);
    res.json({ data: { ...c, sales } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireRole('admin','manager','cashier'), async (req, res) => {
  try {
    const b = req.body;
    const r = await query('INSERT INTO customers (name, phone, email, address, city, customer_group, credit_limit) VALUES (?,?,?,?,?,?,?)',
      [b.name, b.phone || null, b.email || null, b.address || null, b.city || null, b.customer_group || 'regular', b.credit_limit || 0]);
    res.json({ ok: true, id: r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireRole('admin','manager'), async (req, res) => {
  try {
    const b = req.body;
    await query('UPDATE customers SET name=?, phone=?, email=?, address=?, city=?, customer_group=?, credit_limit=?, is_active=? WHERE id=?',
      [b.name, b.phone || null, b.email || null, b.address || null, b.city || null, b.customer_group || 'regular', b.credit_limit || 0, b.is_active!=null?(b.is_active?1:0):1, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireRole('admin','manager'), async (req, res) => {
  try {
    await query('UPDATE customers SET is_active=0 WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
