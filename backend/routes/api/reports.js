const express = require('express');
const { query, getOne } = require('../../config/db');
const { sendExcel, startPDF, pdfHeader, pdfTable } = require('../../config/export');
const i18n = require('../../config/i18n');
const router = express.Router();

function money(n, currency = 'USD') {
  const v = parseFloat(n) || 0;
  if (currency === 'IQD') return Math.round(v).toLocaleString('en-US') + ' IQD';
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) { if (!d) return ''; const dt = d instanceof Date ? d : new Date(d); return isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0,16).replace('T',' '); }
async function getSetting(key, fallback) {
  const r = await getOne('SELECT setting_value FROM settings WHERE setting_key=?', [key]);
  return r ? r.setting_value : fallback;
}
// Pick lang for exports: ?lang=en|ar|ku (default en)
function pickLang(req) {
  const l = (req.query.lang || req.user?.language || 'en').toLowerCase();
  return ['en', 'ar', 'ku'].includes(l) ? l : 'en';
}
function t(lang, key) { return i18n.get(lang, key); }
function pickName(item, lang) {
  if (!item) return '';
  return item['name_' + lang] || item.name_en || item.name || '';
}

// Sales Report (grouped + breakdown)
router.get('/sales', async (req, res) => {
  try {
    const { from, to, branch } = req.query;
    const params = [];
    let where = "s.sale_status='completed'";
    if (from) { where += ' AND s.sale_date >= ?'; params.push(from + ' 00:00:00'); }
    if (to) { where += ' AND s.sale_date <= ?'; params.push(to + ' 23:59:59'); }
    if (branch) { where += ' AND s.branch_id=?'; params.push(parseInt(branch)); }

    const summary = await query(`SELECT
        COUNT(*) AS orders,
        COALESCE(SUM(s.subtotal),0) AS subtotal,
        COALESCE(SUM(s.discount_amount),0) AS discount,
        COALESCE(SUM(s.tax_amount),0) AS tax,
        COALESCE(SUM(s.total),0) AS revenue,
        COALESCE(SUM(s.paid_amount),0) AS paid,
        COALESCE(SUM(si.cost_price * si.quantity),0) AS cost
      FROM sales s LEFT JOIN sale_items si ON si.sale_id=s.id WHERE ${where}`, params);

    const daily = await query(`SELECT DATE(s.sale_date) AS day, COUNT(*) AS orders, COALESCE(SUM(s.total),0) AS revenue
      FROM sales s WHERE ${where} GROUP BY DATE(s.sale_date) ORDER BY day DESC LIMIT 60`, params);

    const byMethod = await query(`SELECT s.payment_method, COUNT(*) AS orders, COALESCE(SUM(s.total),0) AS revenue
      FROM sales s WHERE ${where} GROUP BY s.payment_method`, params);

    const list = await query(`SELECT s.id, s.invoice_no, s.sale_date, s.total, s.payment_status, s.payment_method, c.name AS customer_name, u.name AS user_name
      FROM sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN users u ON u.id=s.user_id
      WHERE ${where} ORDER BY s.id DESC LIMIT 500`, params);

    const profit = summary[0].revenue - summary[0].cost - summary[0].discount;
    res.json({ data: { summary: summary[0], daily, byMethod, list, profit } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Profit & loss
router.get('/profit-loss', async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [from || '2000-01-01', to || '2099-12-31'];
    const sales = await query(`SELECT COALESCE(SUM(total),0) AS revenue, COALESCE(SUM(discount_amount),0) AS discount
      FROM sales WHERE sale_status='completed' AND DATE(sale_date) BETWEEN ? AND ?`, params);
    const cogs = await query(`SELECT COALESCE(SUM(si.cost_price * si.quantity),0) AS cost
      FROM sale_items si JOIN sales s ON s.id=si.sale_id
      WHERE s.sale_status='completed' AND DATE(s.sale_date) BETWEEN ? AND ?`, params);
    const expenses = await query(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE expense_date BETWEEN ? AND ?`, params);
    const returns = await query(`SELECT COALESCE(SUM(total),0) AS total FROM sale_returns WHERE DATE(created_at) BETWEEN ? AND ?`, params);

    const revenue = parseFloat(sales[0].revenue);
    const cost = parseFloat(cogs[0].cost);
    const expense = parseFloat(expenses[0].total);
    const ret = parseFloat(returns[0].total);
    const grossProfit = revenue - cost - ret;
    const netProfit = grossProfit - expense;
    res.json({ data: { revenue, cost, returns: ret, gross_profit: grossProfit, expenses: expense, net_profit: netProfit } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Top products report
router.get('/top-products', async (req, res) => {
  try {
    const { from, to, limit = 20 } = req.query;
    const params = [from || '2000-01-01', to || '2099-12-31'];
    const rows = await query(`SELECT si.product_id, si.product_name, p.sku,
        SUM(si.quantity) AS qty, SUM(si.total) AS revenue, SUM(si.cost_price * si.quantity) AS cost,
        SUM(si.total - si.cost_price * si.quantity) AS profit
      FROM sale_items si JOIN sales s ON s.id=si.sale_id
      LEFT JOIN products p ON p.id=si.product_id
      WHERE s.sale_status='completed' AND DATE(s.sale_date) BETWEEN ? AND ?
      GROUP BY si.product_id, si.product_name, p.sku ORDER BY qty DESC LIMIT ` + parseInt(limit), params);
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Inventory report
router.get('/inventory', async (req, res) => {
  try {
    const rows = await query(`SELECT p.id, p.sku, p.name_en, p.cost_price, p.sell_price,
        SUM(i.quantity) AS qty, SUM(i.quantity * p.cost_price) AS stock_value,
        SUM(i.quantity * p.sell_price) AS retail_value
      FROM products p LEFT JOIN inventory i ON i.product_id=p.id
      WHERE p.is_active=1 GROUP BY p.id ORDER BY stock_value DESC LIMIT 500`);
    const totals = await query(`SELECT SUM(i.quantity * p.cost_price) AS total_cost,
      SUM(i.quantity * p.sell_price) AS total_retail FROM inventory i JOIN products p ON p.id=i.product_id WHERE p.is_active=1`);
    res.json({ data: { rows, totals: totals[0] } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Customers report
router.get('/customers', async (req, res) => {
  try {
    const rows = await query(`SELECT c.id, c.name, c.phone, c.outstanding_balance, c.loyalty_points,
      COUNT(s.id) AS orders, COALESCE(SUM(s.total),0) AS total_spent
      FROM customers c LEFT JOIN sales s ON s.customer_id=c.id AND s.sale_status='completed'
      WHERE c.is_active=1 GROUP BY c.id ORDER BY total_spent DESC LIMIT 200`);
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================== EXPORTS ==================

// Sales Excel
router.get('/sales/export/excel', async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [];
    let where = "s.sale_status='completed'";
    if (from) { where += ' AND s.sale_date >= ?'; params.push(from + ' 00:00:00'); }
    if (to) { where += ' AND s.sale_date <= ?'; params.push(to + ' 23:59:59'); }
    const list = await query(`SELECT s.invoice_no, s.sale_date, s.total, s.paid_amount, s.payment_method, s.payment_status,
      c.name AS customer_name, u.name AS user_name, br.name AS branch_name
      FROM sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN users u ON u.id=s.user_id LEFT JOIN branches br ON br.id=s.branch_id
      WHERE ${where} ORDER BY s.id DESC LIMIT 5000`, params);
    const rows = list.map(s => ({
      invoice_no: s.invoice_no, date: fmtDate(s.sale_date), customer: s.customer_name || 'Walk-in',
      cashier: s.user_name || '', branch: s.branch_name || '',
      method: s.payment_method, status: s.payment_status,
      total: parseFloat(s.total) || 0, paid: parseFloat(s.paid_amount) || 0,
    }));
    const total = rows.reduce((a, b) => a + b.total, 0);
    const paid = rows.reduce((a, b) => a + b.paid, 0);
    await sendExcel(res, `sales-report-${from||'all'}_${to||'all'}`, 'Sales', [
      { key: 'invoice_no', header: 'Invoice #', width: 24 },
      { key: 'date', header: 'Date', width: 20 },
      { key: 'customer', header: 'Customer', width: 22 },
      { key: 'cashier', header: 'Cashier', width: 18 },
      { key: 'branch', header: 'Branch', width: 20 },
      { key: 'method', header: 'Method', width: 12 },
      { key: 'status', header: 'Status', width: 12 },
      { key: 'total', header: 'Total', width: 14, align: 'right', numFmt: '#,##0.00' },
      { key: 'paid', header: 'Paid', width: 14, align: 'right', numFmt: '#,##0.00' },
    ], rows, {
      title: 'Sales Report',
      subtitle: `Period: ${from || 'all'} → ${to || 'today'} · ${rows.length} sales`,
      totals: { invoice_no: 'TOTAL', date: '', customer: '', cashier: '', branch: '', method: '', status: `${rows.length} sales`, total, paid },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Sales PDF
router.get('/sales/export/pdf', async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [];
    let where = "s.sale_status='completed'";
    if (from) { where += ' AND s.sale_date >= ?'; params.push(from + ' 00:00:00'); }
    if (to) { where += ' AND s.sale_date <= ?'; params.push(to + ' 23:59:59'); }
    const list = await query(`SELECT s.invoice_no, s.sale_date, s.total, s.payment_method, s.payment_status,
      c.name AS customer_name FROM sales s LEFT JOIN customers c ON c.id=s.customer_id
      WHERE ${where} ORDER BY s.id DESC LIMIT 5000`, params);
    const total = list.reduce((a, b) => a + (parseFloat(b.total) || 0), 0);
    const companyName = await getSetting('company_name', 'Emergent POS');
    const currency = await getSetting('default_currency', 'USD');
    const doc = startPDF(res, `sales-report-${from||'all'}_${to||'all'}`, { title: 'Sales Report' });
    pdfHeader(doc, { companyName, subtitle: 'Sales Report', title: 'Sales Report', range: `Period: ${from || 'all'} → ${to || 'today'} · ${list.length} invoices` });
    const rows = list.map(s => ({
      invoice_no: s.invoice_no, date: fmtDate(s.sale_date), customer: s.customer_name || 'Walk-in',
      method: s.payment_method, status: s.payment_status, total: money(s.total, currency),
    }));
    pdfTable(doc, [
      { key: 'invoice_no', header: 'Invoice #', weight: 0.22 },
      { key: 'date', header: 'Date', weight: 0.18 },
      { key: 'customer', header: 'Customer', weight: 0.22 },
      { key: 'method', header: 'Method', weight: 0.12 },
      { key: 'status', header: 'Status', weight: 0.12 },
      { key: 'total', header: 'Total', weight: 0.14, align: 'right' },
    ], rows, {
      totals: { invoice_no: 'TOTAL', date: '', customer: '', method: '', status: `${list.length} sales`, total: money(total, currency) },
    });
    doc.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Top products Excel
router.get('/top-products/export/excel', async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [from || '2000-01-01', to || '2099-12-31'];
    const rows = await query(`SELECT si.product_name, p.sku,
        SUM(si.quantity) AS qty, SUM(si.total) AS revenue, SUM(si.cost_price * si.quantity) AS cost,
        SUM(si.total - si.cost_price * si.quantity) AS profit
      FROM sale_items si JOIN sales s ON s.id=si.sale_id
      LEFT JOIN products p ON p.id=si.product_id
      WHERE s.sale_status='completed' AND DATE(s.sale_date) BETWEEN ? AND ?
      GROUP BY si.product_id, si.product_name, p.sku ORDER BY qty DESC LIMIT 500`, params);
    const data = rows.map((r, i) => ({
      rank: i + 1, sku: r.sku || '', product: r.product_name,
      qty: parseFloat(r.qty) || 0, revenue: parseFloat(r.revenue) || 0,
      cost: parseFloat(r.cost) || 0, profit: parseFloat(r.profit) || 0,
    }));
    await sendExcel(res, `top-products-${from||'all'}_${to||'all'}`, 'Top Products', [
      { key: 'rank', header: '#', width: 6 },
      { key: 'sku', header: 'SKU', width: 16 },
      { key: 'product', header: 'Product', width: 32 },
      { key: 'qty', header: 'Qty Sold', width: 12, align: 'right', numFmt: '#,##0.###' },
      { key: 'revenue', header: 'Revenue', width: 14, align: 'right', numFmt: '#,##0.00' },
      { key: 'cost', header: 'Cost', width: 14, align: 'right', numFmt: '#,##0.00' },
      { key: 'profit', header: 'Profit', width: 14, align: 'right', numFmt: '#,##0.00' },
    ], data, {
      title: 'Top Selling Products',
      subtitle: `Period: ${from || 'all'} → ${to || 'today'}`,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Top products PDF
router.get('/top-products/export/pdf', async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [from || '2000-01-01', to || '2099-12-31'];
    const rows = await query(`SELECT si.product_name, p.sku,
        SUM(si.quantity) AS qty, SUM(si.total) AS revenue, SUM(si.cost_price * si.quantity) AS cost,
        SUM(si.total - si.cost_price * si.quantity) AS profit
      FROM sale_items si JOIN sales s ON s.id=si.sale_id
      LEFT JOIN products p ON p.id=si.product_id
      WHERE s.sale_status='completed' AND DATE(s.sale_date) BETWEEN ? AND ?
      GROUP BY si.product_id, si.product_name, p.sku ORDER BY qty DESC LIMIT 100`, params);
    const companyName = await getSetting('company_name', 'Emergent POS');
    const currency = await getSetting('default_currency', 'USD');
    const doc = startPDF(res, `top-products-${from||'all'}_${to||'all'}`, { title: 'Top Products' });
    pdfHeader(doc, { companyName, subtitle: 'Top Selling Products', title: 'Top Selling Products', range: `Period: ${from || 'all'} → ${to || 'today'}` });
    const data = rows.map((r, i) => ({
      rank: '#' + (i + 1), sku: r.sku || '', product: r.product_name,
      qty: (parseFloat(r.qty) || 0).toLocaleString(), revenue: money(r.revenue, currency),
      profit: money(r.profit, currency),
    }));
    pdfTable(doc, [
      { key: 'rank', header: '#', weight: 0.06 },
      { key: 'sku', header: 'SKU', weight: 0.14 },
      { key: 'product', header: 'Product', weight: 0.36 },
      { key: 'qty', header: 'Qty', weight: 0.12, align: 'right' },
      { key: 'revenue', header: 'Revenue', weight: 0.16, align: 'right' },
      { key: 'profit', header: 'Profit', weight: 0.16, align: 'right' },
    ], data);
    doc.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Inventory Excel
router.get('/inventory/export/excel', async (req, res) => {
  try {
    const rows = await query(`SELECT p.sku, p.name_en, p.cost_price, p.sell_price,
        SUM(i.quantity) AS qty, SUM(i.quantity * p.cost_price) AS stock_value,
        SUM(i.quantity * p.sell_price) AS retail_value
      FROM products p LEFT JOIN inventory i ON i.product_id=p.id
      WHERE p.is_active=1 GROUP BY p.id ORDER BY stock_value DESC LIMIT 5000`);
    const data = rows.map(r => ({
      sku: r.sku, product: r.name_en,
      qty: parseFloat(r.qty) || 0,
      cost: parseFloat(r.cost_price) || 0, sell: parseFloat(r.sell_price) || 0,
      stock_value: parseFloat(r.stock_value) || 0, retail_value: parseFloat(r.retail_value) || 0,
    }));
    const totalCost = data.reduce((a, b) => a + b.stock_value, 0);
    const totalRetail = data.reduce((a, b) => a + b.retail_value, 0);
    await sendExcel(res, 'inventory-report', 'Inventory', [
      { key: 'sku', header: 'SKU', width: 16 },
      { key: 'product', header: 'Product', width: 32 },
      { key: 'qty', header: 'On Hand', width: 12, align: 'right', numFmt: '#,##0.###' },
      { key: 'cost', header: 'Unit Cost', width: 14, align: 'right', numFmt: '#,##0.00' },
      { key: 'sell', header: 'Unit Sell', width: 14, align: 'right', numFmt: '#,##0.00' },
      { key: 'stock_value', header: 'Stock Value', width: 16, align: 'right', numFmt: '#,##0.00' },
      { key: 'retail_value', header: 'Retail Value', width: 16, align: 'right', numFmt: '#,##0.00' },
    ], data, {
      title: 'Inventory Report',
      subtitle: `${data.length} products`,
      totals: { sku: 'TOTAL', product: '', qty: '', cost: '', sell: '', stock_value: totalCost, retail_value: totalRetail },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Inventory PDF
router.get('/inventory/export/pdf', async (req, res) => {
  try {
    const rows = await query(`SELECT p.sku, p.name_en, p.cost_price, p.sell_price,
        SUM(i.quantity) AS qty, SUM(i.quantity * p.cost_price) AS stock_value
      FROM products p LEFT JOIN inventory i ON i.product_id=p.id
      WHERE p.is_active=1 GROUP BY p.id ORDER BY stock_value DESC LIMIT 500`);
    const companyName = await getSetting('company_name', 'Emergent POS');
    const currency = await getSetting('default_currency', 'USD');
    const totalCost = rows.reduce((a, b) => a + (parseFloat(b.stock_value) || 0), 0);
    const doc = startPDF(res, 'inventory-report', { title: 'Inventory' });
    pdfHeader(doc, { companyName, subtitle: 'Inventory Valuation', title: 'Inventory Report', range: `${rows.length} active products · Total stock value: ${money(totalCost, currency)}` });
    const data = rows.map(r => ({
      sku: r.sku, product: r.name_en,
      qty: (parseFloat(r.qty) || 0).toLocaleString(),
      cost: money(r.cost_price, currency),
      stock_value: money(r.stock_value, currency),
    }));
    pdfTable(doc, [
      { key: 'sku', header: 'SKU', weight: 0.18 },
      { key: 'product', header: 'Product', weight: 0.42 },
      { key: 'qty', header: 'On Hand', weight: 0.13, align: 'right' },
      { key: 'cost', header: 'Unit Cost', weight: 0.13, align: 'right' },
      { key: 'stock_value', header: 'Stock Value', weight: 0.14, align: 'right' },
    ], data, {
      totals: { sku: 'TOTAL', product: '', qty: '', cost: '', stock_value: money(totalCost, currency) },
    });
    doc.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Profit-Loss Excel
router.get('/profit-loss/export/excel', async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [from || '2000-01-01', to || '2099-12-31'];
    const sales = await query(`SELECT COALESCE(SUM(total),0) AS revenue, COALESCE(SUM(discount_amount),0) AS discount
      FROM sales WHERE sale_status='completed' AND DATE(sale_date) BETWEEN ? AND ?`, params);
    const cogs = await query(`SELECT COALESCE(SUM(si.cost_price * si.quantity),0) AS cost
      FROM sale_items si JOIN sales s ON s.id=si.sale_id
      WHERE s.sale_status='completed' AND DATE(s.sale_date) BETWEEN ? AND ?`, params);
    const expenses = await query(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE expense_date BETWEEN ? AND ?`, params);
    const returns = await query(`SELECT COALESCE(SUM(total),0) AS total FROM sale_returns WHERE DATE(created_at) BETWEEN ? AND ?`, params);

    const revenue = parseFloat(sales[0].revenue);
    const cost = parseFloat(cogs[0].cost);
    const expense = parseFloat(expenses[0].total);
    const ret = parseFloat(returns[0].total);
    const grossProfit = revenue - cost - ret;
    const netProfit = grossProfit - expense;

    const rows = [
      { item: 'Revenue (Sales)', amount: revenue, type: 'inflow' },
      { item: 'Cost of Goods Sold (COGS)', amount: -cost, type: 'outflow' },
      { item: 'Returns', amount: -ret, type: 'outflow' },
      { item: 'GROSS PROFIT', amount: grossProfit, type: 'subtotal' },
      { item: 'Operating Expenses', amount: -expense, type: 'outflow' },
      { item: 'NET PROFIT', amount: netProfit, type: 'total' },
    ];
    await sendExcel(res, `profit-loss-${from||'all'}_${to||'all'}`, 'P&L', [
      { key: 'item', header: 'Item', width: 40 },
      { key: 'amount', header: 'Amount', width: 18, align: 'right', numFmt: '#,##0.00;[Red]-#,##0.00' },
    ], rows, {
      title: 'Profit & Loss Statement',
      subtitle: `Period: ${from || 'all'} → ${to || 'today'}`,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Profit-Loss PDF
router.get('/profit-loss/export/pdf', async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [from || '2000-01-01', to || '2099-12-31'];
    const sales = await query(`SELECT COALESCE(SUM(total),0) AS revenue FROM sales WHERE sale_status='completed' AND DATE(sale_date) BETWEEN ? AND ?`, params);
    const cogs = await query(`SELECT COALESCE(SUM(si.cost_price * si.quantity),0) AS cost FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.sale_status='completed' AND DATE(s.sale_date) BETWEEN ? AND ?`, params);
    const expenses = await query(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE expense_date BETWEEN ? AND ?`, params);
    const returns = await query(`SELECT COALESCE(SUM(total),0) AS total FROM sale_returns WHERE DATE(created_at) BETWEEN ? AND ?`, params);
    const revenue = parseFloat(sales[0].revenue);
    const cost = parseFloat(cogs[0].cost);
    const expense = parseFloat(expenses[0].total);
    const ret = parseFloat(returns[0].total);
    const grossProfit = revenue - cost - ret;
    const netProfit = grossProfit - expense;
    const companyName = await getSetting('company_name', 'Emergent POS');
    const currency = await getSetting('default_currency', 'USD');
    const doc = startPDF(res, `profit-loss-${from||'all'}_${to||'all'}`, { title: 'Profit & Loss' });
    pdfHeader(doc, { companyName, subtitle: 'Profit & Loss Statement', title: 'P&L', range: `Period: ${from || 'all'} → ${to || 'today'}` });
    const rows = [
      { item: 'Revenue (Sales)', amount: money(revenue, currency) },
      { item: 'Cost of Goods Sold (COGS)', amount: '-' + money(cost, currency) },
      { item: 'Returns', amount: '-' + money(ret, currency) },
      { item: 'GROSS PROFIT', amount: money(grossProfit, currency) },
      { item: 'Operating Expenses', amount: '-' + money(expense, currency) },
      { item: 'NET PROFIT', amount: money(netProfit, currency) },
    ];
    pdfTable(doc, [
      { key: 'item', header: 'Item', weight: 0.7 },
      { key: 'amount', header: 'Amount', weight: 0.3, align: 'right' },
    ], rows);
    doc.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Customers Excel
router.get('/customers/export/excel', async (req, res) => {
  try {
    const rows = await query(`SELECT c.id, c.name, c.phone, c.email, c.outstanding_balance, c.loyalty_points,
      COUNT(s.id) AS orders, COALESCE(SUM(s.total),0) AS total_spent
      FROM customers c LEFT JOIN sales s ON s.customer_id=c.id AND s.sale_status='completed'
      WHERE c.is_active=1 GROUP BY c.id ORDER BY total_spent DESC LIMIT 2000`);
    const data = rows.map(r => ({
      id: r.id, name: r.name, phone: r.phone || '', email: r.email || '',
      orders: parseInt(r.orders) || 0,
      total_spent: parseFloat(r.total_spent) || 0,
      outstanding: parseFloat(r.outstanding_balance) || 0,
      loyalty: parseInt(r.loyalty_points) || 0,
    }));
    await sendExcel(res, 'customers-report', 'Customers', [
      { key: 'id', header: '#', width: 6 },
      { key: 'name', header: 'Name', width: 26 },
      { key: 'phone', header: 'Phone', width: 18 },
      { key: 'email', header: 'Email', width: 26 },
      { key: 'orders', header: 'Orders', width: 10, align: 'right' },
      { key: 'total_spent', header: 'Total Spent', width: 16, align: 'right', numFmt: '#,##0.00' },
      { key: 'outstanding', header: 'Outstanding', width: 16, align: 'right', numFmt: '#,##0.00' },
      { key: 'loyalty', header: 'Loyalty', width: 10, align: 'right' },
    ], data, { title: 'Customer Report', subtitle: `${data.length} customers` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
