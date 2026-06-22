const express = require('express');
const { query, getOne, withTransaction } = require('../../config/db');
const { requireRole } = require('../../middleware/auth');
const { genRef, num } = require('../../config/helpers');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { search, status, from, to } = req.query;
    let sql = `SELECT p.*, s.name AS supplier_name, b.name AS branch_name, u.name AS user_name,
      (SELECT COUNT(*) FROM purchase_items WHERE purchase_id=p.id) AS items_count
      FROM purchases p
      LEFT JOIN suppliers s ON s.id=p.supplier_id
      LEFT JOIN branches b ON b.id=p.branch_id
      LEFT JOIN users u ON u.id=p.user_id WHERE 1=1`;
    const params = [];
    if (search) { sql += ' AND p.ref_no LIKE ?'; params.push(`%${search}%`); }
    if (status) { sql += ' AND p.status=?'; params.push(status); }
    if (from) { sql += ' AND p.purchase_date >= ?'; params.push(from + ' 00:00:00'); }
    if (to) { sql += ' AND p.purchase_date <= ?'; params.push(to + ' 23:59:59'); }
    sql += ' ORDER BY p.id DESC LIMIT 200';
    res.json({ data: await query(sql, params) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const p = await getOne('SELECT p.*, s.name AS supplier_name, b.name AS branch_name FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN branches b ON b.id=p.branch_id WHERE p.id=?', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'not_found' });
    const items = await query('SELECT pi.*, pr.name_en AS product_name, pr.sku FROM purchase_items pi LEFT JOIN products pr ON pr.id=pi.product_id WHERE pi.purchase_id=?', [req.params.id]);
    res.json({ data: { ...p, items } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireRole('admin','manager'), async (req, res) => {
  const b = req.body;
  if (!b.items || !b.items.length) return res.status(400).json({ error: 'no_items' });
  try {
    const result = await withTransaction(async (conn) => {
      const refNo = genRef('PO');
      const branchId = b.branch_id || req.user.branch_id || 1;
      let subtotal = 0;
      for (const it of b.items) subtotal += num(it.quantity) * num(it.cost_price);
      const discount = num(b.discount_amount || 0);
      const tax = num(b.tax_amount || 0);
      const shipping = num(b.shipping || 0);
      const total = subtotal - discount + tax + shipping;
      const paid = num(b.paid_amount || 0);
      const paymentStatus = paid >= total ? 'paid' : (paid > 0 ? 'partial' : 'unpaid');
      const status = b.status || 'received';

      const [pr] = await conn.execute(
        `INSERT INTO purchases (ref_no, supplier_id, branch_id, user_id, purchase_date, currency, exchange_rate, subtotal, discount_amount, tax_amount, shipping, total, paid_amount, payment_status, status, notes)
         VALUES (?,?,?,?,NOW(),?,?,?,?,?,?,?,?,?,?,?)`,
        [refNo, b.supplier_id, branchId, req.user.id, b.currency || 'USD', num(b.exchange_rate || 1), subtotal, discount, tax, shipping, total, paid, paymentStatus, status, b.notes || null]);
      const pid = pr.insertId;
      for (const it of b.items) {
        const lineTotal = num(it.quantity) * num(it.cost_price);
        await conn.execute('INSERT INTO purchase_items (purchase_id, product_id, quantity, cost_price, total) VALUES (?,?,?,?,?)',
          [pid, it.product_id, num(it.quantity), num(it.cost_price), lineTotal]);
        if (status === 'received') {
          await conn.execute('INSERT INTO inventory (product_id, branch_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)',
            [it.product_id, branchId, num(it.quantity)]);
          await conn.execute('INSERT INTO stock_movements (product_id, branch_id, movement_type, quantity, reference_type, reference_id, user_id) VALUES (?,?,?,?,?,?,?)',
            [it.product_id, branchId, 'purchase', num(it.quantity), 'purchase', pid, req.user.id]);
          // Optionally update cost_price
          if (it.update_cost) {
            await conn.execute('UPDATE products SET cost_price=? WHERE id=?', [num(it.cost_price), it.product_id]);
          }
        }
      }
      if (paymentStatus !== 'paid') {
        await conn.execute('UPDATE suppliers SET outstanding_balance = outstanding_balance + ? WHERE id=?', [total - paid, b.supplier_id]);
      }
      return { id: pid, ref_no: refNo, total };
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[purchase create]', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
