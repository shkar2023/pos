// Currency & money formatting helpers
function num(v) {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function fmtMoney(amount, currency = 'USD') {
  const n = num(amount);
  if (currency === 'IQD') {
    // No decimals for IQD
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' IQD';
  }
  return '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function convert(amount, from, to, rate) {
  // rate = USD->IQD
  const n = num(amount);
  if (from === to) return n;
  if (from === 'USD' && to === 'IQD') return n * num(rate);
  if (from === 'IQD' && to === 'USD') return n / num(rate);
  return n;
}

function fmtDate(d) {
  if (!d) return '';
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth()+1).padStart(2,'0');
  const dd = String(dt.getDate()).padStart(2,'0');
  const hh = String(dt.getHours()).padStart(2,'0');
  const mi = String(dt.getMinutes()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function fmtDateOnly(d) {
  if (!d) return '';
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

function genRef(prefix) {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

function pickName(item, lang) {
  if (!item) return '';
  const key = `name_${lang}`;
  return item[key] || item.name_en || item.name || '';
}

module.exports = { num, fmtMoney, convert, fmtDate, fmtDateOnly, genRef, pickName };
