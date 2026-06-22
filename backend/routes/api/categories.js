const express = require('express');
const { query, getOne } = require('../../config/db');
const { requireRole } = require('../../middleware/auth');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const rows = await query(`SELECT c.*, (SELECT COUNT(*) FROM products WHERE category_id=c.id) AS product_count FROM categories c ORDER BY c.name_en`);
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireRole('admin','manager'), async (req, res) => {
  try {
    const { name_en, name_ar, name_ku, color, icon } = req.body;
    const r = await query('INSERT INTO categories (name_en, name_ar, name_ku, color, icon) VALUES (?,?,?,?,?)',
      [name_en, name_ar || null, name_ku || null, color || '#6366f1', icon || 'package']);
    res.json({ ok: true, id: r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireRole('admin','manager'), async (req, res) => {
  try {
    const { name_en, name_ar, name_ku, color, icon, is_active } = req.body;
    await query('UPDATE categories SET name_en=?, name_ar=?, name_ku=?, color=?, icon=?, is_active=? WHERE id=?',
      [name_en, name_ar || null, name_ku || null, color || '#6366f1', icon || 'package', is_active?1:0, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireRole('admin','manager'), async (req, res) => {
  try {
    await query('UPDATE categories SET is_active=0 WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
