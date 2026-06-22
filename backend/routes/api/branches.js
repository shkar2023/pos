const express = require('express');
const { query } = require('../../config/db');
const { requireRole } = require('../../middleware/auth');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    res.json({ data: await query('SELECT * FROM branches ORDER BY id') });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { name, code, address, phone, is_warehouse } = req.body;
    const r = await query('INSERT INTO branches (name, code, address, phone, is_warehouse) VALUES (?,?,?,?,?)',
      [name, code, address || null, phone || null, is_warehouse?1:0]);
    res.json({ ok: true, id: r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, code, address, phone, is_warehouse, is_active } = req.body;
    await query('UPDATE branches SET name=?, code=?, address=?, phone=?, is_warehouse=?, is_active=? WHERE id=?',
      [name, code, address || null, phone || null, is_warehouse?1:0, is_active?1:0, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await query('UPDATE branches SET is_active=0 WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
