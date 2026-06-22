// Simple i18n loader
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const SUPPORTED = ['en', 'ar', 'ku'];
const RTL = ['ar', 'ku'];

const translations = {};
for (const lang of SUPPORTED) {
  translations[lang] = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${lang}.json`), 'utf8'));
}

function get(lang, key, fallback) {
  const parts = key.split('.');
  let cur = translations[lang] || translations.en;
  for (const p of parts) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p];
    else { cur = null; break; }
  }
  if (cur == null) {
    // fallback to english
    cur = translations.en;
    for (const p of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p];
      else { cur = null; break; }
    }
  }
  return cur == null ? (fallback || key) : cur;
}

function middleware(req, res, next) {
  let lang = (req.cookies && req.cookies.lang) || (req.query && req.query.lang) || process.env.DEFAULT_LANGUAGE || 'en';
  if (!SUPPORTED.includes(lang)) lang = 'en';
  if (req.query && req.query.lang && SUPPORTED.includes(req.query.lang)) {
    res.cookie('lang', req.query.lang, { maxAge: 365 * 24 * 3600 * 1000, httpOnly: false, path: '/' });
    lang = req.query.lang;
  }
  req.lang = lang;
  req.t = (key, fb) => get(lang, key, fb);
  res.locals.t = req.t;
  res.locals.lang = lang;
  res.locals.dir = RTL.includes(lang) ? 'rtl' : 'ltr';
  res.locals.isRTL = RTL.includes(lang);
  res.locals.supportedLangs = SUPPORTED;
  next();
}

module.exports = { middleware, get, SUPPORTED, RTL };
