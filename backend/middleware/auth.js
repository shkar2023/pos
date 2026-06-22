// Auth middleware - JWT cookie + bearer header support
const jwt = require('jsonwebtoken');
const { getOne } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name, branch_id: user.branch_id },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function setAuthCookie(res, token) {
  res.cookie('access_token', token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 12 * 3600 * 1000,
    path: '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie('access_token', { path: '/' });
}

function extractToken(req) {
  if (req.cookies && req.cookies.access_token) return req.cookies.access_token;
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

async function loadUser(req) {
  const token = extractToken(req);
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await getOne('SELECT id, name, email, role, branch_id, language, is_active, avatar FROM users WHERE id=? AND is_active=1', [payload.sub]);
    return user;
  } catch (e) {
    return null;
  }
}

// Web (EJS) middleware: redirects to /login if not authenticated
function _isApi(req) {
  const url = req.originalUrl || req.url || '';
  return url.startsWith('/api/') || url === '/api' || (req.baseUrl || '').startsWith('/api');
}
async function requireAuth(req, res, next) {
  const user = await loadUser(req);
  if (!user) {
    if (_isApi(req)) {
      return res.status(401).json({ error: 'unauthenticated' });
    }
    return res.redirect('/login');
  }
  req.user = user;
  res.locals.currentUser = user;
  next();
}

// Optional auth - just loads if exists, doesn't redirect
async function optionalAuth(req, res, next) {
  const user = await loadUser(req);
  if (user) {
    req.user = user;
    res.locals.currentUser = user;
  }
  next();
}

// RBAC - requires one of the given roles
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    if (!roles.includes(req.user.role)) {
      if (_isApi(req)) {
        return res.status(403).json({ error: 'forbidden', message: 'Insufficient permissions' });
      }
      return res.status(403).render('error', { title: 'Forbidden', message: 'You do not have permission to access this page.', code: 403 });
    }
    next();
  };
}

module.exports = { signToken, setAuthCookie, clearAuthCookie, requireAuth, optionalAuth, requireRole, loadUser };
