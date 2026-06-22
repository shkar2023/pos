// Main Express server - serves both /api/* JSON endpoints and EJS-rendered web pages
require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const morgan = require('morgan');
const expressLayouts = require('express-ejs-layouts');
const rateLimit = require('express-rate-limit');

const i18n = require('./config/i18n');
const helpers = require('./config/helpers');
const { pool, query, getOne } = require('./config/db');
const { optionalAuth, requireAuth, requireRole } = require('./middleware/auth');

const app = express();
const PORT = parseInt(process.env.PORT || '8001', 10);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/app');

// Middleware
app.use(morgan('tiny'));
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true, limit: '4mb' }));
app.use(cookieParser());
app.use(methodOverride('_method'));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use(i18n.middleware);

// CORS for API endpoints
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Expose helpers to views
app.use((req, res, next) => {
  res.locals.h = helpers;
  res.locals.appName = process.env.COMPANY_NAME || 'POS System';
  res.locals.appUrl = process.env.APP_URL || '';
  res.locals.path = req.path;
  res.locals.query = req.query;
  next();
});

// Rate limiter for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'too_many_attempts', message: 'Too many login attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============ Routes ============

// Health endpoint
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'pos', time: new Date().toISOString() }));

// Auth
const authRoutes = require('./routes/auth');
app.use('/', authRoutes(loginLimiter));

// Web (EJS) routes - require authentication
app.use('/', optionalAuth, require('./routes/web'));

// API routes - require authentication
app.use('/api', requireAuth, require('./routes/api'));

// Error handlers
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'not_found' });
  }
  res.status(404).render('error', { title: '404', message: 'Page not found', code: 404 });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
  res.status(500).render('error', { title: 'Error', message: err.message, code: 500 });
});

// Start
async function start() {
  try {
    // Verify DB
    await pool.query('SELECT 1');
    console.log(`[startup] MySQL connection OK`);
  } catch (e) {
    console.error('[startup] DB error:', e.message);
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[startup] POS server listening on port ${PORT}`);
  });
}

start();
