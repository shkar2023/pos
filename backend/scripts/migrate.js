// Run schema migration and seed initial data
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function migrate() {
  // Read schema
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT, 10),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: true,
    charset: 'utf8mb4_unicode_ci',
  });

  console.log('[migrate] Running schema...');
  await conn.query(schemaSql);
  console.log('[migrate] Schema applied.');

  // ---- SEED ----
  console.log('[seed] Seeding initial data...');

  // Admin user
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@pos.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const adminName = process.env.ADMIN_NAME || 'System Administrator';

  const [existing] = await conn.query('SELECT id, password_hash FROM users WHERE email=?', [adminEmail]);
  const hash = await bcrypt.hash(adminPassword, 10);
  if (existing.length === 0) {
    await conn.query(
      'INSERT INTO users (name,email,password_hash,role,language) VALUES (?,?,?,?,?)',
      [adminName, adminEmail, hash, 'admin', 'en']
    );
    console.log('[seed] Admin user created:', adminEmail);
  } else {
    const match = await bcrypt.compare(adminPassword, existing[0].password_hash);
    if (!match) {
      await conn.query('UPDATE users SET password_hash=? WHERE email=?', [hash, adminEmail]);
      console.log('[seed] Admin password updated.');
    } else {
      console.log('[seed] Admin already exists.');
    }
  }

  // Demo users
  const demoUsers = [
    { name: 'Manager Demo', email: 'manager@pos.com', role: 'manager', password: 'manager123' },
    { name: 'Cashier Demo', email: 'cashier@pos.com', role: 'cashier', password: 'cashier123' },
    { name: 'Accountant Demo', email: 'accountant@pos.com', role: 'accountant', password: 'account123' },
  ];
  for (const u of demoUsers) {
    const [ex] = await conn.query('SELECT id FROM users WHERE email=?', [u.email]);
    if (ex.length === 0) {
      const h = await bcrypt.hash(u.password, 10);
      await conn.query('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)',
        [u.name, u.email, h, u.role]);
      console.log('[seed] Demo user:', u.email);
    }
  }

  // Branches
  const [br] = await conn.query('SELECT COUNT(*) AS c FROM branches');
  if (br[0].c === 0) {
    await conn.query(
      `INSERT INTO branches (name, code, address, phone, is_warehouse) VALUES
      ('Main Store', 'MAIN', 'Erbil, Iraq', '+964 750 000 0001', 0),
      ('Branch 2 - Sulaymaniyah', 'SUL', 'Sulaymaniyah, Iraq', '+964 750 000 0002', 0),
      ('Central Warehouse', 'WH', 'Erbil Warehouse', '+964 750 000 0003', 1)`
    );
    // assign admin/manager to main
    await conn.query("UPDATE users SET branch_id=1 WHERE branch_id IS NULL");
  }

  // Units
  const [un] = await conn.query('SELECT COUNT(*) AS c FROM units');
  if (un[0].c === 0) {
    await conn.query(
      `INSERT INTO units (name, short_code) VALUES
      ('Piece', 'pcs'),('Kilogram', 'kg'),('Liter', 'L'),('Box', 'box'),('Carton', 'ctn')`
    );
  }

  // Brands
  const [bn] = await conn.query('SELECT COUNT(*) AS c FROM brands');
  if (bn[0].c === 0) {
    await conn.query(
      `INSERT INTO brands (name) VALUES ('Generic'),('Samsung'),('Apple'),('Nestle'),('Coca-Cola'),('Lipton')`
    );
  }

  // Categories
  const [ct] = await conn.query('SELECT COUNT(*) AS c FROM categories');
  if (ct[0].c === 0) {
    await conn.query(
      `INSERT INTO categories (name_en, name_ar, name_ku, color, icon) VALUES
       ('Beverages','المشروبات','خواردنەوەکان','#0ea5e9','coffee'),
       ('Snacks','الوجبات الخفيفة','خۆراکی سووک','#f59e0b','cookie'),
       ('Electronics','الإلكترونيات','ئەلیکترۆنیات','#8b5cf6','smartphone'),
       ('Household','منزلية','ماڵەوە','#10b981','home'),
       ('Bakery','المخبوزات','نانەوا','#ef4444','croissant'),
       ('Dairy','الألبان','شیرەمەنی','#06b6d4','milk'),
       ('Personal Care','العناية الشخصية','چاودێری کەسی','#ec4899','sparkles'),
       ('Stationery','القرطاسية','نووسینگە','#6366f1','pen-tool')`
    );
  }

  // Sample products
  const [pd] = await conn.query('SELECT COUNT(*) AS c FROM products');
  if (pd[0].c === 0) {
    const sampleProducts = [
      // [sku,barcode,name_en,name_ar,name_ku,cat,brand,unit,cost,sell,wholesale,curr,tax,alert,stockQty]
      ['SKU-1001','7290000000001','Coca-Cola 330ml','كوكا كولا 330مل','کۆکا کۆلا 330مل',1,5,1,0.40,0.75,0.65,'USD',5,10,300],
      ['SKU-1002','7290000000002','Pepsi 330ml','بيبسي 330مل','پێپسی 330مل',1,1,1,0.40,0.75,0.65,'USD',5,10,250],
      ['SKU-1003','7290000000003','Water Bottle 500ml','زجاجة ماء 500مل','بۆتڵی ئاو 500مل',1,1,1,0.15,0.30,0.25,'USD',0,20,500],
      ['SKU-2001','7290000000010','Lays Classic Chips','رقائق ليز كلاسيك','لەیز چیپس',2,1,1,0.50,1.20,1.00,'USD',5,10,180],
      ['SKU-2002','7290000000011','KitKat Chocolate Bar','كيت كات شوكولا','کیتکات چاکلێت',2,4,1,0.80,1.75,1.50,'USD',5,10,160],
      ['SKU-3001','7290000000020','iPhone 15 Pro','آيفون 15 برو','ئایفۆن 15 پرۆ',3,3,1,950.00,1299.00,1200.00,'USD',0,2,8],
      ['SKU-3002','7290000000021','Samsung Galaxy S24','سامسونغ S24','سامسۆنگ S24',3,2,1,820.00,1099.00,1000.00,'USD',0,2,10],
      ['SKU-3003','7290000000022','USB-C Cable 1m','كابل USB-C 1م','کێبڵی یو ئێس بی-سی',3,1,1,1.50,5.00,4.00,'USD',5,15,150],
      ['SKU-4001','7290000000030','Dish Soap 750ml','صابون أطباق','سابوونی قاپ',4,1,3,1.20,2.99,2.50,'USD',5,10,90],
      ['SKU-5001','7290000000040','White Bread Loaf','رغيف خبز أبيض','نانی سپی',5,1,1,0.80,2.00,1.75,'USD',0,5,60],
      ['SKU-6001','7290000000050','Milk 1L','حليب 1لتر','شیر 1 لیتر',6,4,3,1.00,2.50,2.20,'USD',0,5,50],
      ['SKU-7001','7290000000060','Shampoo 400ml','شامبو 400مل','شامپۆ 400مل',7,1,1,2.50,5.99,5.00,'USD',5,10,80],
      ['SKU-8001','7290000000070','Notebook A4','دفتر A4','دەفتەری A4',8,1,1,1.00,2.50,2.00,'USD',0,20,200],
      ['SKU-8002','7290000000071','Ballpoint Pen','قلم حبر','پێنووسی ئەسرین',8,1,1,0.20,0.75,0.50,'USD',0,30,500],
    ];
    for (const p of sampleProducts) {
      const stockQty = p[14];
      const productRow = p.slice(0,14);
      const [r] = await conn.query(
        `INSERT INTO products
        (sku,barcode,name_en,name_ar,name_ku,category_id,brand_id,unit_id,cost_price,sell_price,wholesale_price,currency,tax_rate,alert_quantity)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        productRow
      );
      const pid = r.insertId;
      // Add inventory in all 3 branches (more in main)
      const branchQties = [stockQty, Math.floor(stockQty/2), Math.floor(stockQty*1.5)];
      for (let bi = 1; bi <= 3; bi++) {
        await conn.query('INSERT INTO inventory (product_id, branch_id, quantity) VALUES (?,?,?)',
          [pid, bi, branchQties[bi-1]]);
        await conn.query(
          'INSERT INTO stock_movements (product_id, branch_id, movement_type, quantity, notes) VALUES (?,?,?,?,?)',
          [pid, bi, 'opening', branchQties[bi-1], 'Initial stock']);
      }
    }
    console.log('[seed] Sample products created.');
  }

  // Customers
  const [cu] = await conn.query('SELECT COUNT(*) AS c FROM customers');
  if (cu[0].c === 0) {
    await conn.query(
      `INSERT INTO customers (name, phone, email, city, customer_group, credit_limit) VALUES
      ('Walk-in Customer','','','','regular',0),
      ('Ahmed Hassan','+964 750 111 1111','ahmed@example.com','Erbil','regular',500),
      ('Sara Mohammed','+964 750 222 2222','sara@example.com','Sulaymaniyah','vip',2000),
      ('Karwan Ali','+964 750 333 3333','karwan@example.com','Erbil','regular',300),
      ('Layla Mahmoud','+964 750 444 4444','layla@example.com','Duhok','wholesale',5000)`
    );
  }

  // Suppliers
  const [su] = await conn.query('SELECT COUNT(*) AS c FROM suppliers');
  if (su[0].c === 0) {
    await conn.query(
      `INSERT INTO suppliers (name, contact_person, phone, email, city) VALUES
      ('Global Distributors','John Smith','+964 750 555 0001','sales@global.com','Erbil'),
      ('Local Foods Co.','Rebwar Aziz','+964 750 555 0002','info@localfoods.iq','Erbil'),
      ('TechWorld Imports','Hawre Kareem','+964 750 555 0003','contact@techworld.iq','Sulaymaniyah')`
    );
  }

  // Expense categories
  const [ec] = await conn.query('SELECT COUNT(*) AS c FROM expense_categories');
  if (ec[0].c === 0) {
    await conn.query(
      `INSERT INTO expense_categories (name) VALUES
      ('Rent'),('Utilities'),('Salary'),('Maintenance'),('Marketing'),('Office Supplies'),('Other')`
    );
  }

  // Settings
  const settings = [
    ['company_name', process.env.COMPANY_NAME || 'Emergent POS'],
    ['company_phone', process.env.COMPANY_PHONE || ''],
    ['company_address', process.env.COMPANY_ADDRESS || ''],
    ['default_currency', process.env.DEFAULT_CURRENCY || 'USD'],
    ['default_language', process.env.DEFAULT_LANGUAGE || 'en'],
    ['exchange_rate_usd_iqd', process.env.EXCHANGE_RATE_USD_TO_IQD || '1480'],
    ['tax_rate', '0'],
    ['receipt_footer', 'Thank you for shopping with us!'],
    ['logo_url', ''],
    ['enable_loyalty', '1'],
    ['loyalty_points_per_currency', '1'],
  ];
  for (const [k, v] of settings) {
    await conn.query('INSERT INTO settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=setting_value', [k, v]);
  }

  console.log('[seed] Done.');
  await conn.end();
}

migrate().then(() => {
  console.log('[migrate] Complete.');
  process.exit(0);
}).catch(err => {
  console.error('[migrate] Failed:', err);
  process.exit(1);
});
