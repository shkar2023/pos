-- ============================================================
-- COMPREHENSIVE POS SYSTEM SCHEMA
-- Multi-language (en, ar, ku), Multi-currency (USD, IQD)
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ----------------- USERS & ROLES -----------------
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','manager','cashier','accountant') NOT NULL DEFAULT 'cashier',
  phone VARCHAR(40) DEFAULT NULL,
  branch_id INT DEFAULT NULL,
  avatar VARCHAR(255) DEFAULT NULL,
  language ENUM('en','ar','ku') NOT NULL DEFAULT 'en',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  identifier VARCHAR(255) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_attempts_identifier (identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------- BRANCHES / WAREHOUSES -----------------
CREATE TABLE IF NOT EXISTS branches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(30) NOT NULL UNIQUE,
  address TEXT DEFAULT NULL,
  phone VARCHAR(40) DEFAULT NULL,
  is_warehouse TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------- CATEGORIES -----------------
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name_en VARCHAR(150) NOT NULL,
  name_ar VARCHAR(150) DEFAULT NULL,
  name_ku VARCHAR(150) DEFAULT NULL,
  parent_id INT DEFAULT NULL,
  color VARCHAR(20) DEFAULT '#6366f1',
  icon VARCHAR(50) DEFAULT 'package',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------- BRANDS / UNITS -----------------
CREATE TABLE IF NOT EXISTS brands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS units (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  short_code VARCHAR(20) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------- PRODUCTS -----------------
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(80) NOT NULL UNIQUE,
  barcode VARCHAR(80) DEFAULT NULL,
  name_en VARCHAR(200) NOT NULL,
  name_ar VARCHAR(200) DEFAULT NULL,
  name_ku VARCHAR(200) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  category_id INT DEFAULT NULL,
  brand_id INT DEFAULT NULL,
  unit_id INT DEFAULT NULL,
  cost_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  sell_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  wholesale_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency ENUM('USD','IQD') NOT NULL DEFAULT 'USD',
  tax_rate DECIMAL(6,2) NOT NULL DEFAULT 0,
  alert_quantity INT NOT NULL DEFAULT 5,
  image VARCHAR(255) DEFAULT NULL,
  track_stock TINYINT(1) NOT NULL DEFAULT 1,
  is_service TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_products_barcode (barcode),
  INDEX idx_products_category (category_id),
  FULLTEXT idx_products_search (sku, name_en, name_ar, name_ku, barcode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------- INVENTORY (per branch) -----------------
CREATE TABLE IF NOT EXISTS inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  branch_id INT NOT NULL,
  quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_prod_branch (product_id, branch_id),
  INDEX idx_inventory_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  branch_id INT NOT NULL,
  movement_type ENUM('purchase','sale','return','adjustment','transfer_in','transfer_out','opening') NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  reference_type VARCHAR(40) DEFAULT NULL,
  reference_id INT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  user_id INT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mv_product (product_id),
  INDEX idx_mv_branch (branch_id),
  INDEX idx_mv_type (movement_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_transfers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ref_no VARCHAR(40) NOT NULL UNIQUE,
  from_branch_id INT NOT NULL,
  to_branch_id INT NOT NULL,
  status ENUM('pending','completed','cancelled') NOT NULL DEFAULT 'completed',
  notes TEXT DEFAULT NULL,
  user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transfer_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(14,3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------- CUSTOMERS / SUPPLIERS -----------------
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(40) DEFAULT NULL,
  email VARCHAR(190) DEFAULT NULL,
  address TEXT DEFAULT NULL,
  city VARCHAR(80) DEFAULT NULL,
  customer_group VARCHAR(50) DEFAULT 'regular',
  loyalty_points INT NOT NULL DEFAULT 0,
  credit_limit DECIMAL(14,2) NOT NULL DEFAULT 0,
  outstanding_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cust_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  contact_person VARCHAR(120) DEFAULT NULL,
  phone VARCHAR(40) DEFAULT NULL,
  email VARCHAR(190) DEFAULT NULL,
  address TEXT DEFAULT NULL,
  city VARCHAR(80) DEFAULT NULL,
  tax_no VARCHAR(80) DEFAULT NULL,
  outstanding_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------- SALES -----------------
CREATE TABLE IF NOT EXISTS sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_no VARCHAR(40) NOT NULL UNIQUE,
  branch_id INT NOT NULL,
  customer_id INT DEFAULT NULL,
  user_id INT NOT NULL,
  sale_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  currency ENUM('USD','IQD') NOT NULL DEFAULT 'USD',
  exchange_rate DECIMAL(14,4) NOT NULL DEFAULT 1,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount_type ENUM('fixed','percent') NOT NULL DEFAULT 'fixed',
  discount_value DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  shipping DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  change_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  payment_status ENUM('paid','partial','unpaid') NOT NULL DEFAULT 'paid',
  payment_method ENUM('cash','card','bank','mixed','credit') NOT NULL DEFAULT 'cash',
  sale_status ENUM('completed','held','cancelled','returned') NOT NULL DEFAULT 'completed',
  notes TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sales_date (sale_date),
  INDEX idx_sales_branch (branch_id),
  INDEX idx_sales_customer (customer_id),
  INDEX idx_sales_status (sale_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sale_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id INT NOT NULL,
  product_id INT NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  cost_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL,
  INDEX idx_si_sale (sale_id),
  INDEX idx_si_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sale_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id INT NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency ENUM('USD','IQD') NOT NULL DEFAULT 'USD',
  method ENUM('cash','card','bank','credit') NOT NULL DEFAULT 'cash',
  reference VARCHAR(120) DEFAULT NULL,
  paid_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sale_returns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ref_no VARCHAR(40) NOT NULL UNIQUE,
  sale_id INT NOT NULL,
  branch_id INT NOT NULL,
  user_id INT NOT NULL,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sale_return_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  return_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  total DECIMAL(14,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------- PURCHASES -----------------
CREATE TABLE IF NOT EXISTS purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ref_no VARCHAR(40) NOT NULL UNIQUE,
  supplier_id INT NOT NULL,
  branch_id INT NOT NULL,
  user_id INT NOT NULL,
  purchase_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  currency ENUM('USD','IQD') NOT NULL DEFAULT 'USD',
  exchange_rate DECIMAL(14,4) NOT NULL DEFAULT 1,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  shipping DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  payment_status ENUM('paid','partial','unpaid') NOT NULL DEFAULT 'unpaid',
  status ENUM('received','pending','cancelled') NOT NULL DEFAULT 'received',
  notes TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  cost_price DECIMAL(14,2) NOT NULL,
  total DECIMAL(14,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------- EXPENSES -----------------
CREATE TABLE IF NOT EXISTS expense_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ref_no VARCHAR(40) NOT NULL UNIQUE,
  category_id INT DEFAULT NULL,
  branch_id INT NOT NULL,
  user_id INT NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency ENUM('USD','IQD') NOT NULL DEFAULT 'USD',
  expense_date DATE NOT NULL,
  description TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_exp_date (expense_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------- CASH REGISTER -----------------
CREATE TABLE IF NOT EXISTS cash_registers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  branch_id INT NOT NULL,
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  closing_balance DECIMAL(14,2) DEFAULT NULL,
  total_sales DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_cash DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_card DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_returns DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_expenses DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes TEXT DEFAULT NULL,
  status ENUM('open','closed') NOT NULL DEFAULT 'open',
  opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------- SETTINGS -----------------
CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------- ACTIVITY LOG -----------------
CREATE TABLE IF NOT EXISTS activity_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(60) DEFAULT NULL,
  entity_id INT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  ip VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_log_user (user_id),
  INDEX idx_log_date (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
