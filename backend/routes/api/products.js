const express = require('express');
const { query, getOne, withTransaction } = require('../../config/db');
const { requireRole } = require('../../middleware/auth');
const router = express.Router();

// List products with filters
router.get('/', async (req, res) => {
  try {
    const { search, category, brand, status, branch, limit = 100, offset = 0 } = req.query;
    let sql = `SELECT p.*, c.name_en AS category_name_en, c.name_ar AS category_name_ar, c.name_ku AS category_name_ku, b.name AS brand_name, u.name AS unit_name, u.short_code AS unit_code,
        (SELECT COALESCE(SUM(quantity),0) FROM inventory WHERE product_id=p.id ${branch ? 'AND branch_id=?' : ''}) AS stock_qty
      FROM products p
      LEFT JOIN categories c ON c.id=p.category_id
      LEFT JOIN brands b ON b.id=p.brand_id
      LEFT JOIN units u ON u.id=p.unit_id
      WHERE 1=1`;
    const params = [];
    if (branch) params.push(parseInt(branch));
    if (search) {
      sql += ` AND (p.name_en LIKE ? OR p.name_ar LIKE ? OR p.name_ku LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)`;
      const s = `%${search}%`;
      params.push(s,s,s,s,s);
    }
    if (category) { sql += ' AND p.category_id=?'; params.push(parseInt(category)); }
    if (brand) { sql += ' AND p.brand_id=?'; params.push(parseInt(brand)); }
    if (status === 'active') sql += ' AND p.is_active=1';
    if (status === 'inactive') sql += ' AND p.is_active=0';
    sql += ' ORDER BY p.id DESC LIMIT ' + parseInt(limit) + ' OFFSET ' + parseInt(offset);
    const rows = await query(sql, params);
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Lookup by barcode (for POS)
router.get('/barcode/:code', async (req, res) => {
  try {
    const branchId = req.user.branch_id || 1;
    const p = await getOne(`SELECT p.*, (SELECT COALESCE(quantity,0) FROM inventory WHERE product_id=p.id AND branch_id=?) AS stock_qty
      FROM products p WHERE p.barcode=? OR p.sku=? LIMIT 1`,
      [branchId, req.params.code, req.params.code]);
    if (!p) return res.status(404).json({ error: 'not_found' });
    res.json({ data: p });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get single
router.get('/:id', async (req, res) => {
  try {
    const p = await getOne('SELECT * FROM products WHERE id=?', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'not_found' });
    const inv = await query('SELECT i.*, b.name AS branch_name FROM inventory i JOIN branches b ON b.id=i.branch_id WHERE i.product_id=?', [req.params.id]);
    res.json({ data: { ...p, inventory: inv } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create
router.post('/', requireRole('admin','manager'), async (req, res) => {
  try {
    const b = req.body;
    const result = await query(
      `INSERT INTO products (sku, barcode, name_en, name_ar, name_ku, description, category_id, brand_id, unit_id, cost_price, sell_price, wholesale_price, currency, tax_rate, alert_quantity, track_stock, is_service, is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.sku, b.barcode || null, b.name_en, b.name_ar || null, b.name_ku || null, b.description || null,
       b.category_id || null, b.brand_id || null, b.unit_id || null,
       b.cost_price || 0, b.sell_price || 0, b.wholesale_price || 0, b.currency || 'USD',
       b.tax_rate || 0, b.alert_quantity || 5, b.track_stock != null ? (b.track_stock?1:0) : 1,
       b.is_service ? 1 : 0, b.is_active != null ? (b.is_active?1:0) : 1]
    );
    const pid = result.insertId;
    // initialize inventory in all branches
    const branches = await query('SELECT id FROM branches');
    for (const br of branches) {
      const initQty = (b.opening_stock && br.id === (b.branch_id || 1)) ? parseFloat(b.opening_stock) : 0;
      await query('INSERT INTO inventory (product_id, branch_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity', [pid, br.id, initQty]);
      if (initQty > 0) {
        await query('INSERT INTO stock_movements (product_id, branch_id, movement_type, quantity, notes, user_id) VALUES (?,?,?,?,?,?)',
          [pid, br.id, 'opening', initQty, 'Initial stock', req.user.id]);
      }
    }
    res.json({ ok: true, id: pid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update
router.put('/:id', requireRole('admin','manager'), async (req, res) => {
  try {
    const b = req.body;
    await query(
      `UPDATE products SET sku=?, barcode=?, name_en=?, name_ar=?, name_ku=?, description=?, category_id=?, brand_id=?, unit_id=?, cost_price=?, sell_price=?, wholesale_price=?, currency=?, tax_rate=?, alert_quantity=?, track_stock=?, is_service=?, is_active=? WHERE id=?`,
      [b.sku, b.barcode || null, b.name_en, b.name_ar || null, b.name_ku || null, b.description || null,
       b.category_id || null, b.brand_id || null, b.unit_id || null,
       b.cost_price || 0, b.sell_price || 0, b.wholesale_price || 0, b.currency || 'USD',
       b.tax_rate || 0, b.alert_quantity || 5, b.track_stock != null ? (b.track_stock?1:0) : 1,
       b.is_service ? 1 : 0, b.is_active != null ? (b.is_active?1:0) : 1, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete
router.delete('/:id', requireRole('admin','manager'), async (req, res) => {
  try {
    await query('UPDATE products SET is_active=0 WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
