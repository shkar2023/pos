# Emergent POS - Product Requirements Document

## Original Problem Statement
Build a comprehensive POS (Point of Sale) system using Node.js + MySQL + EJS with:
- Multi-language support: English, Arabic, Kurdish (with RTL)
- Multi-currency: IQD (Iraqi Dinar) + USD with exchange rate
- Super advanced (not basic at all)

## Architecture
- **Backend**: Node.js + Express + EJS (server-rendered) — runs on ports 8001 (API) and 3000 (Web) as same single app
- **Database**: MariaDB 10.11 (MySQL-compatible) running locally in container, managed by supervisor
- **Auth**: JWT (HTTP-only cookie + Bearer fallback) with bcrypt password hashing
- **i18n**: Custom JSON locale files (en.json, ar.json, ku.json) with RTL support for Arabic/Kurdish
- **Frontend assets**: Tailwind-free hand-crafted CSS, Tabler icons, Chart.js for analytics

## Modules Implemented (Phase 1)
- **Auth & RBAC**: Login/Logout, JWT cookie, 4 roles (admin/manager/cashier/accountant) with role guards
- **Dashboard**: KPIs (today's sales/orders, 7-day revenue, low stock, products, customers), revenue chart (line), category breakdown (doughnut), recent sales, top products, stock alerts
- **POS Terminal**: Category filter, product grid, search, barcode lookup, cart with qty controls, customer selection, payment modal (cash/card/bank/credit), quick-amount keys, hold/clear, receipt printing
- **Products**: CRUD with multi-language names (EN/AR/KU), SKU, barcode, category, brand, unit, cost/sell/wholesale prices, tax rate, alert quantity, opening stock, currency, image
- **Categories**: CRUD with multi-language names, color, icon
- **Inventory**: View by branch, low-stock filter, manual stock adjustments
- **Stock Transfers**: Inter-branch transfers with audit trail
- **Sales**: List/filter, invoice detail page, print receipt (80mm thermal receipt format), return processing
- **Purchases**: Create purchase from suppliers, auto-stock increment, supplier payable tracking
- **Customers**: CRUD with phone/email/address, customer groups (regular/vip/wholesale), loyalty points, credit limits, outstanding balance
- **Suppliers**: CRUD, contact info, tax number, outstanding balance
- **Expenses**: CRUD with categories, branch-level tracking
- **Users**: Admin can CRUD users, assign roles & branches, set language preference
- **Branches**: Admin can manage stores and warehouses
- **Settings**: Company info, currency, exchange rate, default language, tax, receipt footer, loyalty config
- **Reports**: P&L statement, sales report (daily breakdown + payment methods), top products with profit analysis
- **Activity Log**: All user actions tracked with IP, timestamps

## Languages
- English (LTR, Outfit font)
- Arabic (RTL, IBM Plex Sans Arabic font)
- Kurdish/Sorani (RTL, IBM Plex Sans Arabic font)

## Currencies
- USD (default, 2 decimals, $ prefix)
- IQD (no decimals, "IQD" suffix)
- Configurable exchange rate (USD→IQD) in Settings

## Pre-Seeded Data
- 4 demo users (one per role)
- 3 branches (2 stores + 1 warehouse)
- 8 product categories with translations
- 14 sample products across categories with inventory in all 3 branches
- 5 customers, 3 suppliers, 7 expense categories
- Default settings (company info, exchange rate 1 USD = 1480 IQD)

## Backlog / Future Enhancements
- P1: Cash register session (open/close with reconciliation), full barcode label generator/printer
- P2: Restaurant module (tables, kitchen display), e-receipts via SMS/WhatsApp, customer credit ledger UI
- P3: Promotions/coupons, Stripe online payments, multi-tax brackets per region, Excel/PDF export

## Implementation Status (Jan 2026)
- ✅ Core modules complete and tested via curl
- ✅ Multi-language UI (en/ar/ku) with RTL
- ✅ Multi-currency (USD/IQD) with formatting
- ✅ Dashboard with real-time KPIs and charts
- ✅ POS terminal with full sale flow
- ✅ All CRUD modules
- ✅ Reports with profit analysis
- ✅ MariaDB schema with 20+ tables, FULLTEXT indexes for search
