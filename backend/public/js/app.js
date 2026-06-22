// EMERGENT POS - Client app helpers
(function(){
  window.API = {
    async req(method, url, body) {
      const opts = { method, credentials: 'same-origin', headers: { 'Accept': 'application/json' } };
      if (body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
      const res = await fetch(url, opts);
      let data = null;
      try { data = await res.json(); } catch(e) { data = null; }
      if (!res.ok) {
        throw new Error((data && (data.message || data.error)) || `HTTP ${res.status}`);
      }
      return data;
    },
    get(url) { return this.req('GET', url); },
    post(url, body) { return this.req('POST', url, body); },
    put(url, body) { return this.req('PUT', url, body); },
    del(url) { return this.req('DELETE', url); },
    patch(url, body) { return this.req('PATCH', url, body); },
  };

  // Toast
  window.toast = function(msg, type='info', title=null) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const icons = { success: 'ti-circle-check', warning: 'ti-alert-triangle', error: 'ti-alert-circle', info: 'ti-info-circle' };
    const titles = { success: 'Success', warning: 'Warning', error: 'Error', info: 'Notice' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="ti ${icons[type]||icons.info}"></i>
      <div style="flex:1">
        <div class="toast-title">${title || titles[type] || titles.info}</div>
        <div class="toast-msg">${msg}</div>
      </div>`;
    c.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(()=>el.remove(), 250); }, 3500);
  };

  // Currency formatting
  window.fmt = {
    money(n, currency = (localStorage.getItem('pos_currency')||'USD')) {
      n = parseFloat(n) || 0;
      if (currency === 'IQD') {
        return new Intl.NumberFormat('en-US', {maximumFractionDigits: 0}).format(Math.round(n)) + ' IQD';
      }
      return '$' + new Intl.NumberFormat('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(n);
    },
    date(s) {
      if (!s) return '-';
      const d = new Date(s);
      if (isNaN(d.getTime())) return s;
      return d.toLocaleString();
    },
    num(n) { return new Intl.NumberFormat('en-US').format(parseFloat(n)||0); },
  };

  // Modal helpers
  window.Modal = {
    open(id) { const el = document.getElementById(id); if (el) el.classList.add('open'); },
    close(id) { const el = document.getElementById(id); if (el) el.classList.remove('open'); },
  };

  // Currency switcher
  document.addEventListener('click', function(e) {
    const cur = e.target.closest('[data-cur]');
    if (cur) {
      e.preventDefault();
      const c = cur.dataset.cur;
      localStorage.setItem('pos_currency', c);
      const el = document.getElementById('currentCurrency');
      if (el) el.textContent = c;
      window.dispatchEvent(new CustomEvent('currency-change', { detail: { currency: c } }));
      toast(`Currency switched to ${c}`, 'success');
    }
  });

  // Init current currency
  document.addEventListener('DOMContentLoaded', function() {
    const c = localStorage.getItem('pos_currency') || 'USD';
    const el = document.getElementById('currentCurrency');
    if (el) el.textContent = c;
  });

  // Global keyboard
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const s = document.getElementById('globalSearch');
      if (s) s.focus();
    }
  });

  // Confirm helper
  window.confirmAction = function(msg) {
    return window.confirm(msg || 'Are you sure?');
  };
})();
