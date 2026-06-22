const express = require('express');
const { query } = require('../../config/db');
const { requireRole } = require('../../middleware/auth');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const rows = await query('SELECT setting_key, setting_value FROM settings');
    const obj = {};
    for (const r of rows) obj[r.setting_key] = r.setting_value;
    res.json({ data: obj });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const updates = req.body || {};
    for (const k of Object.keys(updates)) {
      await query('INSERT INTO settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
        [k, String(updates[k] == null ? '' : updates[k])]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Brands and units lookups
router.get('/brands', async (req, res) => {
  res.json({ data: await query('SELECT * FROM brands WHERE is_active=1 ORDER BY name') });
});
router.get('/units', async (req, res) => {
  res.json({ data: await query('SELECT * FROM units WHERE is_active=1 ORDER BY name') });
});

router.post('/brands', requireRole('admin','manager'), async (req, res) => {
  try {
    const r = await query('INSERT INTO brands (name) VALUES (?)', [req.body.name]);
    res.json({ ok: true, id: r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/units', requireRole('admin','manager'), async (req, res) => {
  try {
    const r = await query('INSERT INTO units (name, short_code) VALUES (?,?)', [req.body.name, req.body.short_code]);
    res.json({ ok: true, id: r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
