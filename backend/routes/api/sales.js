// Sales / Invoices - core POS transaction handling
const express = require('express');
const { query, getOne, withTransaction } = require('../../config/db');
const { requireRole } = require('../../middleware/auth');
const { genRef, num } = require('../../config/helpers');
const router = express.Router();

// List sales
router.get('/', async (req, res) => {
  try {
    const { search, status, branch, customer, from, to, limit = 50, offset = 0 } = req.query;
    let sql = `SELECT s.*, c.name AS customer_name, u.name AS cashier_name, br.name AS branch_name,
      (SELECT COUNT(*) FROM sale_items WHERE sale_id=s.id) AS items_count
      FROM sales s
      LEFT JOIN customers c ON c.id=s.customer_id
      LEFT JOIN users u ON u.id=s.user_id
      LEFT JOIN branches br ON br.id=s.branch_id
      WHERE 1=1`;
    const params = [];
    if (search) { sql += ' AND s.invoice_no LIKE ?'; params.push(`%${search}%`); }
    if (status) { sql += ' AND s.sale_status=?'; params.push(status); }
    if (branch) { sql += ' AND s.branch_id=?'; params.push(parseInt(branch)); }
    if (customer) { sql += ' AND s.customer_id=?'; params.push(parseInt(customer)); }
    if (from) { sql += ' AND s.sale_date >= ?'; params.push(from + ' 00:00:00'); }
    if (to) { sql += ' AND s.sale_date <= ?'; params.push(to + ' 23:59:59'); }
    sql += ' ORDER BY s.id DESC LIMIT ' + parseInt(limit) + ' OFFSET ' + parseInt(offset);
    res.json({ data: await query(sql, params) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get single sale with items
router.get('/:id', async (req, res) => {
  try {
    const s = await getOne(`SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address,
      u.name AS cashier_name, br.name AS branch_name, br.address AS branch_address, br.phone AS branch_phone
      FROM sales s
      LEFT JOIN customers c ON c.id=s.customer_id
      LEFT JOIN users u ON u.id=s.user_id
      LEFT JOIN branches br ON br.id=s.branch_id
      WHERE s.id=?`, [req.params.id]);
    if (!s) return res.status(404).json({ error: 'not_found' });
    const items = await query('SELECT * FROM sale_items WHERE sale_id=?', [req.params.id]);
    const payments = await query('SELECT * FROM sale_payments WHERE sale_id=?', [req.params.id]);
    res.json({ data: { ...s, items, payments } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create new sale
router.post('/', requireRole('admin','manager','cashier'), async (req, res) => {
  const b = req.body;
  if (!b.items || !Array.isArray(b.items) || b.items.length === 0) {
    return res.status(400).json({ error: 'no_items' });
  }
  try {
    const result = await withTransaction(async (conn) => {
      const branchId = b.branch_id || req.user.branch_id || 1;
      const customerId = b.customer_id || 1; // walk-in default
      const currency = b.currency || 'USD';
      const exchangeRate = num(b.exchange_rate || 1);
      const sale_status = b.sale_status || 'completed';
      const invoiceNo = genRef('INV');

      let subtotal = 0;
      const enrichedItems = [];
      for (const it of b.items) {
        const p = await getOne('SELECT * FROM products WHERE id=?', [it.product_id]);
        if (!p) throw new Error('Product not found: ' + it.product_id);
        const qty = num(it.quantity);
        const price = num(it.unit_price != null ? it.unit_price : p.sell_price);
        const disc = num(it.discount || 0);
        const tax = num(it.tax || 0);
        const lineTotal = qty * price - disc + tax;
        subtotal += qty * price;
        enrichedItems.push({
          product_id: p.id, product_name: p.name_en, quantity: qty, unit_price: price,
          cost_price: num(p.cost_price), discount: disc, tax: tax, total: lineTotal,
          track_stock: p.track_stock,
        });
      }
      const discountValue = num(b.discount_value || 0);
      const discountType = b.discount_type || 'fixed';
      const discountAmount = discountType === 'percent' ? (subtotal * discountValue / 100) : discountValue;
      const taxAmount = num(b.tax_amount || 0);
      const shipping = num(b.shipping || 0);
      const total = subtotal - discountAmount + taxAmount + shipping;
      const paid = num(b.paid_amount || 0);
      const change = paid > total ? paid - total : 0;
      const payment_status = paid >= total ? 'paid' : (paid > 0 ? 'partial' : 'unpaid');

      const [saleRes] = await conn.execute(
        `INSERT INTO sales (invoice_no, branch_id, customer_id, user_id, sale_date, currency, exchange_rate,
          subtotal, discount_type, discount_value, discount_amount, tax_amount, shipping, total, paid_amount, change_amount,
          payment_status, payment_method, sale_status, notes)
        VALUES (?,?,?,?,NOW(),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [invoiceNo, branchId, customerId, req.user.id, currency, exchangeRate,
         subtotal, discountType, discountValue, discountAmount, taxAmount, shipping, total, paid, change,
         payment_status, b.payment_method || 'cash', sale_status, b.notes || null]);
      const saleId = saleRes.insertId;

      for (const it of enrichedItems) {
        await conn.execute('INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, cost_price, discount, tax, total) VALUES (?,?,?,?,?,?,?,?,?)',
          [saleId, it.product_id, it.product_name, it.quantity, it.unit_price, it.cost_price, it.discount, it.tax, it.total]);
        // decrement inventory if completed
        if (sale_status === 'completed' && it.track_stock) {
          await conn.execute('UPDATE inventory SET quantity = quantity - ? WHERE product_id=? AND branch_id=?',
            [it.quantity, it.product_id, branchId]);
          await conn.execute('INSERT INTO stock_movements (product_id, branch_id, movement_type, quantity, reference_type, reference_id, user_id) VALUES (?,?,?,?,?,?,?)',
            [it.product_id, branchId, 'sale', -it.quantity, 'sale', saleId, req.user.id]);
        }
      }
      if (paid > 0) {
        await conn.execute('INSERT INTO sale_payments (sale_id, amount, currency, method, paid_at) VALUES (?,?,?,?,NOW())',
          [saleId, Math.min(paid, total), currency, b.payment_method || 'cash']);
      }
      // update customer balance if credit
      if (payment_status !== 'paid' && customerId && customerId !== 1) {
        const owed = total - paid;
        await conn.execute('UPDATE customers SET outstanding_balance = outstanding_balance + ? WHERE id=?', [owed, customerId]);
      }
      // loyalty points (1 point per currency unit on settings)
      try {
        const setting = await conn.execute('SELECT setting_value FROM settings WHERE setting_key="enable_loyalty"');
        if (setting[0][0] && setting[0][0].setting_value === '1' && customerId && customerId !== 1) {
          await conn.execute('UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id=?', [Math.floor(total), customerId]);
        }
      } catch(e){}
      // activity
      await conn.execute('INSERT INTO activity_log (user_id, action, entity_type, entity_id, description) VALUES (?,?,?,?,?)',
        [req.user.id, 'create_sale', 'sale', saleId, `Created sale ${invoiceNo} total ${total}`]);
      return { id: saleId, invoice_no: invoiceNo, total, change };
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[sale create]', e);
    res.status(500).json({ error: e.message });
  }
});

// Update sale status (e.g., hold -> completed, cancel)
router.patch('/:id/status', requireRole('admin','manager'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['completed','cancelled','held'].includes(status)) return res.status(400).json({ error: 'invalid_status' });
    await query('UPDATE sales SET sale_status=? WHERE id=?', [status, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Process Return
router.post('/:id/return', requireRole('admin','manager'), async (req, res) => {
  try {
    const result = await withTransaction(async (conn) => {
      const sale = (await conn.execute('SELECT * FROM sales WHERE id=?', [req.params.id]))[0][0];
      if (!sale) throw new Error('sale_not_found');
      const items = req.body.items || [];
      const refNo = genRef('RET');
      let total = 0;
      const [ret] = await conn.execute(
        'INSERT INTO sale_returns (ref_no, sale_id, branch_id, user_id, total, notes) VALUES (?,?,?,?,?,?)',
        [refNo, sale.id, sale.branch_id, req.user.id, 0, req.body.notes || null]
      );
      for (const it of items) {
        const qty = num(it.quantity);
        const price = num(it.unit_price);
        const lineTotal = qty * price;
        total += lineTotal;
        await conn.execute('INSERT INTO sale_return_items (return_id, product_id, quantity, unit_price, total) VALUES (?,?,?,?,?)',
          [ret.insertId, it.product_id, qty, price, lineTotal]);
        // restock
        await conn.execute('UPDATE inventory SET quantity = quantity + ? WHERE product_id=? AND branch_id=?',
          [qty, it.product_id, sale.branch_id]);
        await conn.execute('INSERT INTO stock_movements (product_id, branch_id, movement_type, quantity, reference_type, reference_id, user_id) VALUES (?,?,?,?,?,?,?)',
          [it.product_id, sale.branch_id, 'return', qty, 'return', ret.insertId, req.user.id]);
      }
      await conn.execute('UPDATE sale_returns SET total=? WHERE id=?', [total, ret.insertId]);
      await conn.execute('UPDATE sales SET sale_status="returned" WHERE id=?', [sale.id]);
      return { id: ret.insertId, ref_no: refNo, total };
    });
    res.json({ ok: true, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
