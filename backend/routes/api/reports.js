const express = require('express');
const { query } = require('../../config/db');
const router = express.Router();

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

module.exports = router;
