const express = require('express');
const { query, getOne, withTransaction } = require('../../config/db');
const { requireRole } = require('../../middleware/auth');
const { num, genRef } = require('../../config/helpers');
const router = express.Router();

// List inventory across products+branches
router.get('/', async (req, res) => {
  try {
    const { branch, low_only, search } = req.query;
    let sql = `SELECT p.id AS product_id, p.sku, p.name_en, p.name_ar, p.name_ku, p.barcode, p.cost_price, p.sell_price, p.alert_quantity,
        c.name_en AS category_name,
        i.branch_id, b.name AS branch_name, i.quantity
      FROM products p
      LEFT JOIN categories c ON c.id=p.category_id
      JOIN inventory i ON i.product_id=p.id
      JOIN branches b ON b.id=i.branch_id
      WHERE p.is_active=1`;
    const params = [];
    if (branch) { sql += ' AND i.branch_id=?'; params.push(parseInt(branch)); }
    if (search) { sql += ' AND (p.name_en LIKE ? OR p.sku LIKE ?)'; const s=`%${search}%`; params.push(s,s); }
    if (low_only == '1') sql += ' AND i.quantity <= p.alert_quantity';
    sql += ' ORDER BY p.id DESC LIMIT 500';
    res.json({ data: await query(sql, params) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Adjust stock
router.post('/adjust', requireRole('admin','manager'), async (req, res) => {
  try {
    const { product_id, branch_id, quantity, notes } = req.body;
    const qty = num(quantity);
    await query('INSERT INTO inventory (product_id, branch_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity + VALUES(quantity)',
      [product_id, branch_id, qty]);
    await query('INSERT INTO stock_movements (product_id, branch_id, movement_type, quantity, notes, user_id) VALUES (?,?,?,?,?,?)',
      [product_id, branch_id, 'adjustment', qty, notes || 'Manual adjustment', req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Set stock to specific value
router.post('/set', requireRole('admin','manager'), async (req, res) => {
  try {
    const { product_id, branch_id, quantity, notes } = req.body;
    const newQty = num(quantity);
    const current = await getOne('SELECT quantity FROM inventory WHERE product_id=? AND branch_id=?', [product_id, branch_id]);
    const oldQty = current ? num(current.quantity) : 0;
    const diff = newQty - oldQty;
    await query('INSERT INTO inventory (product_id, branch_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)',
      [product_id, branch_id, newQty]);
    await query('INSERT INTO stock_movements (product_id, branch_id, movement_type, quantity, notes, user_id) VALUES (?,?,?,?,?,?)',
      [product_id, branch_id, 'adjustment', diff, notes || 'Stock set', req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Transfer between branches
router.post('/transfer', requireRole('admin','manager'), async (req, res) => {
  try {
    const { from_branch_id, to_branch_id, items, notes } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'no_items' });
    const result = await withTransaction(async (conn) => {
      const refNo = genRef('TRF');
      const [tr] = await conn.execute(
        'INSERT INTO stock_transfers (ref_no, from_branch_id, to_branch_id, status, notes, user_id) VALUES (?,?,?,?,?,?)',
        [refNo, from_branch_id, to_branch_id, 'completed', notes || null, req.user.id]
      );
      for (const it of items) {
        const qty = num(it.quantity);
        await conn.execute('INSERT INTO stock_transfer_items (transfer_id, product_id, quantity) VALUES (?,?,?)',
          [tr.insertId, it.product_id, qty]);
        await conn.execute('UPDATE inventory SET quantity=quantity - ? WHERE product_id=? AND branch_id=?',
          [qty, it.product_id, from_branch_id]);
        await conn.execute('INSERT INTO inventory (product_id, branch_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',
          [it.product_id, to_branch_id, qty]);
        await conn.execute('INSERT INTO stock_movements (product_id, branch_id, movement_type, quantity, reference_type, reference_id, user_id) VALUES (?,?,?,?,?,?,?)',
          [it.product_id, from_branch_id, 'transfer_out', -qty, 'transfer', tr.insertId, req.user.id]);
        await conn.execute('INSERT INTO stock_movements (product_id, branch_id, movement_type, quantity, reference_type, reference_id, user_id) VALUES (?,?,?,?,?,?,?)',
          [it.product_id, to_branch_id, 'transfer_in', qty, 'transfer', tr.insertId, req.user.id]);
      }
      return { id: tr.insertId, ref_no: refNo };
    });
    res.json({ ok: true, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/movements', async (req, res) => {
  try {
    const { product_id, branch_id, type, from, to } = req.query;
    let sql = `SELECT m.*, p.name_en AS product_name, p.sku, b.name AS branch_name, u.name AS user_name
      FROM stock_movements m
      LEFT JOIN products p ON p.id=m.product_id
      LEFT JOIN branches b ON b.id=m.branch_id
      LEFT JOIN users u ON u.id=m.user_id
      WHERE 1=1`;
    const params = [];
    if (product_id) { sql += ' AND m.product_id=?'; params.push(parseInt(product_id)); }
    if (branch_id) { sql += ' AND m.branch_id=?'; params.push(parseInt(branch_id)); }
    if (type) { sql += ' AND m.movement_type=?'; params.push(type); }
    if (from) { sql += ' AND m.created_at >= ?'; params.push(from + ' 00:00:00'); }
    if (to) { sql += ' AND m.created_at <= ?'; params.push(to + ' 23:59:59'); }
    sql += ' ORDER BY m.id DESC LIMIT 300';
    res.json({ data: await query(sql, params) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
