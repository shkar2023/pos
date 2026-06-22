const express = require('express');
const { query, getOne } = require('../../config/db');
const { requireRole } = require('../../middleware/auth');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    let sql = 'SELECT * FROM suppliers WHERE 1=1';
    const params = [];
    if (search) { sql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)'; const s=`%${search}%`; params.push(s,s,s); }
    sql += ' ORDER BY id DESC LIMIT 200';
    res.json({ data: await query(sql, params) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireRole('admin','manager'), async (req, res) => {
  try {
    const b = req.body;
    const r = await query('INSERT INTO suppliers (name, contact_person, phone, email, address, city, tax_no) VALUES (?,?,?,?,?,?,?)',
      [b.name, b.contact_person || null, b.phone || null, b.email || null, b.address || null, b.city || null, b.tax_no || null]);
    res.json({ ok: true, id: r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireRole('admin','manager'), async (req, res) => {
  try {
    const b = req.body;
    await query('UPDATE suppliers SET name=?, contact_person=?, phone=?, email=?, address=?, city=?, tax_no=?, is_active=? WHERE id=?',
      [b.name, b.contact_person || null, b.phone || null, b.email || null, b.address || null, b.city || null, b.tax_no || null, b.is_active!=null?(b.is_active?1:0):1, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireRole('admin','manager'), async (req, res) => {
  try {
    await query('UPDATE suppliers SET is_active=0 WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
