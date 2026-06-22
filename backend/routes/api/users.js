const express = require('express');
const bcrypt = require('bcryptjs');
const { query, getOne } = require('../../config/db');
const { requireRole } = require('../../middleware/auth');
const router = express.Router();

router.get('/', requireRole('admin','manager'), async (req, res) => {
  try {
    res.json({ data: await query('SELECT id, name, email, role, phone, branch_id, language, is_active, last_login_at, created_at FROM users ORDER BY id DESC') });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.email || !b.password || !b.name) return res.status(400).json({ error: 'missing_fields' });
    const exists = await getOne('SELECT id FROM users WHERE email=?', [b.email.toLowerCase()]);
    if (exists) return res.status(400).json({ error: 'email_exists' });
    const hash = await bcrypt.hash(b.password, 10);
    const r = await query('INSERT INTO users (name, email, password_hash, role, phone, branch_id, language) VALUES (?,?,?,?,?,?,?)',
      [b.name, b.email.toLowerCase(), hash, b.role || 'cashier', b.phone || null, b.branch_id || null, b.language || 'en']);
    res.json({ ok: true, id: r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const b = req.body;
    const fields = ['name=?','email=?','role=?','phone=?','branch_id=?','language=?','is_active=?'];
    const params = [b.name, b.email.toLowerCase(), b.role, b.phone || null, b.branch_id || null, b.language || 'en', b.is_active?1:0];
    if (b.password) {
      const hash = await bcrypt.hash(b.password, 10);
      fields.push('password_hash=?');
      params.push(hash);
    }
    params.push(req.params.id);
    await query(`UPDATE users SET ${fields.join(', ')} WHERE id=?`, params);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'cant_delete_self' });
    await query('UPDATE users SET is_active=0 WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Profile - allow user to update own language / password
router.post('/me/update', async (req, res) => {
  try {
    const { language, current_password, new_password } = req.body;
    if (language) {
      await query('UPDATE users SET language=? WHERE id=?', [language, req.user.id]);
      res.cookie('lang', language, { maxAge: 365*24*3600*1000, path: '/' });
    }
    if (new_password) {
      const me = await getOne('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
      const ok = await bcrypt.compare(current_password || '', me.password_hash);
      if (!ok) return res.status(400).json({ error: 'wrong_current_password' });
      const hash = await bcrypt.hash(new_password, 10);
      await query('UPDATE users SET password_hash=? WHERE id=?', [hash, req.user.id]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
