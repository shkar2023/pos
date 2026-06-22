// Auth routes - login, logout, me
const express = require('express');
const bcrypt = require('bcryptjs');
const { query, getOne } = require('../config/db');
const { signToken, setAuthCookie, clearAuthCookie, requireAuth, optionalAuth } = require('../middleware/auth');

module.exports = (loginLimiter) => {
  const router = express.Router();

  // Show login page
  router.get('/login', optionalAuth, (req, res) => {
    if (req.user) return res.redirect('/');
    res.render('auth/login', { title: 'Login', layout: 'layouts/auth', error: null });
  });

  // POST /login (form)
  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password, redirect_to } = req.body;
    const isAjax = req.headers.accept && req.headers.accept.includes('application/json');
    try {
      const user = await getOne('SELECT * FROM users WHERE email=? AND is_active=1', [String(email || '').toLowerCase().trim()]);
      if (!user) {
        if (isAjax) return res.status(401).json({ error: 'invalid_credentials' });
        return res.status(401).render('auth/login', { title: 'Login', layout: 'layouts/auth', error: req.t('auth.invalid_credentials') });
      }
      const ok = await bcrypt.compare(password || '', user.password_hash);
      if (!ok) {
        if (isAjax) return res.status(401).json({ error: 'invalid_credentials' });
        return res.status(401).render('auth/login', { title: 'Login', layout: 'layouts/auth', error: req.t('auth.invalid_credentials') });
      }
      await query('UPDATE users SET last_login_at=NOW() WHERE id=?', [user.id]);
      const token = signToken(user);
      setAuthCookie(res, token);
      if (user.language) res.cookie('lang', user.language, { maxAge: 365*24*3600*1000, path: '/' });
      try {
        await query('INSERT INTO activity_log (user_id, action, description, ip) VALUES (?,?,?,?)',
          [user.id, 'login', `User logged in`, (req.ip || '').replace(/^.*:/, '')]);
      } catch(e){}
      if (isAjax) {
        return res.json({ ok: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
      }
      res.redirect(redirect_to || '/');
    } catch (e) {
      console.error('[login] error:', e);
      if (isAjax) return res.status(500).json({ error: 'server_error' });
      res.status(500).render('auth/login', { title: 'Login', layout: 'layouts/auth', error: 'Server error' });
    }
  });

  // API login (JSON)
  router.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body;
    try {
      const user = await getOne('SELECT * FROM users WHERE email=? AND is_active=1', [String(email || '').toLowerCase().trim()]);
      if (!user) return res.status(401).json({ error: 'invalid_credentials' });
      const ok = await bcrypt.compare(password || '', user.password_hash);
      if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
      await query('UPDATE users SET last_login_at=NOW() WHERE id=?', [user.id]);
      const token = signToken(user);
      setAuthCookie(res, token);
      res.json({ ok: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role, branch_id: user.branch_id } });
    } catch (e) {
      res.status(500).json({ error: 'server_error', message: e.message });
    }
  });

  // GET /api/auth/me
  router.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  // Logout
  router.post('/logout', (req, res) => {
    clearAuthCookie(res);
    res.redirect('/login');
  });
  router.get('/logout', (req, res) => {
    clearAuthCookie(res);
    res.redirect('/login');
  });
  router.post('/api/auth/logout', (req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  });

  return router;
};
