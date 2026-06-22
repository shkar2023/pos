const express = require('express');
const { query } = require('../../config/db');
const router = express.Router();

// Dashboard summary
router.get('/summary', async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const todayStr = today.toISOString().slice(0,19).replace('T',' ');
    const sevenAgo = new Date(Date.now() - 7*24*3600*1000);
    const sevenStr = sevenAgo.toISOString().slice(0,19).replace('T',' ');

    const [todaySales] = await query("SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS count FROM sales WHERE sale_status='completed' AND sale_date >= ?", [todayStr]);
    const [weekSales] = await query("SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS count FROM sales WHERE sale_status='completed' AND sale_date >= ?", [sevenStr]);
    const [productCount] = await query("SELECT COUNT(*) AS total FROM products WHERE is_active=1");
    const [customerCount] = await query("SELECT COUNT(*) AS total FROM customers WHERE is_active=1");
    const [lowStock] = await query(`SELECT COUNT(*) AS total FROM (
      SELECT p.id FROM products p
      JOIN inventory i ON i.product_id=p.id
      WHERE p.is_active=1 AND p.track_stock=1
      GROUP BY p.id HAVING SUM(i.quantity) <= MAX(p.alert_quantity)) x`);
    const [todayExpenses] = await query("SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE expense_date = CURDATE()");

    // Sales chart (last 7 days)
    const chart = await query(`SELECT DATE(sale_date) AS day, COALESCE(SUM(total),0) AS total, COUNT(*) AS orders
      FROM sales WHERE sale_status='completed' AND sale_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(sale_date) ORDER BY day`);

    // Top products
    const topProducts = await query(`SELECT si.product_id, si.product_name, SUM(si.quantity) AS qty, SUM(si.total) AS revenue
      FROM sale_items si JOIN sales s ON s.id=si.sale_id
      WHERE s.sale_status='completed' AND s.sale_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY si.product_id, si.product_name ORDER BY qty DESC LIMIT 5`);

    // Sales by category
    const byCategory = await query(`SELECT c.id, c.name_en, c.name_ar, c.name_ku, c.color, COALESCE(SUM(si.total),0) AS revenue
      FROM categories c
      LEFT JOIN products p ON p.category_id=c.id
      LEFT JOIN sale_items si ON si.product_id=p.id
      LEFT JOIN sales s ON s.id=si.sale_id AND s.sale_status='completed' AND s.sale_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY c.id ORDER BY revenue DESC LIMIT 8`);

    // Recent sales
    const recent = await query(`SELECT s.id, s.invoice_no, s.total, s.sale_date, s.payment_status, c.name AS customer_name
      FROM sales s LEFT JOIN customers c ON c.id=s.customer_id
      WHERE s.sale_status='completed'
      ORDER BY s.id DESC LIMIT 8`);

    // Low stock items
    const lowList = await query(`SELECT p.id, p.sku, p.name_en, p.name_ar, p.name_ku, p.alert_quantity, SUM(i.quantity) AS qty
      FROM products p JOIN inventory i ON i.product_id=p.id
      WHERE p.is_active=1 AND p.track_stock=1
      GROUP BY p.id HAVING qty <= p.alert_quantity ORDER BY qty ASC LIMIT 6`);

    res.json({
      data: {
        today: { sales: parseFloat(todaySales.total), orders: parseInt(todaySales.count), expenses: parseFloat(todayExpenses.total) },
        week: { sales: parseFloat(weekSales.total), orders: parseInt(weekSales.count) },
        counts: { products: productCount.total, customers: customerCount.total, low_stock: lowStock.total },
        chart, topProducts, byCategory, recent, lowList,
      }
    });
  } catch (e) {
    console.error('[dashboard]', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
