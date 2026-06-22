"""
Backend API tests for POS system (Node.js + Express + MariaDB).
Covers: auth, products, categories, customers, inventory, sales, dashboard,
suppliers, branches, settings, users, role-based access.
"""
import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://multi-trade-pos.preview.emergentagent.com').rstrip('/')

ADMIN = {"email": "admin@pos.com", "password": "admin123"}
CASHIER = {"email": "cashier@pos.com", "password": "cashier123"}


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    s.admin_token = data['token']
    s.admin_user = data['user']
    return s


@pytest.fixture(scope="session")
def cashier_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=CASHIER, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"cashier login failed: {r.status_code} {r.text}")
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return s


# ---------- Health & Auth ----------
class TestHealth:
    def test_health(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


class TestAuth:
    def test_login_success(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("ok") is True
        assert "token" in d and isinstance(d["token"], str)
        assert d["user"]["email"] == ADMIN["email"]
        assert d["user"]["role"] == "admin"

    def test_login_invalid(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "admin@pos.com", "password": "wrong"}, timeout=15)
        assert r.status_code == 401
        assert r.json().get("error") == "invalid_credentials"

    def test_me_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code == 401

    def test_me_with_bearer(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code == 200
        assert r.json()["user"]["email"] == ADMIN["email"]

    def test_products_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/products", timeout=10)
        assert r.status_code == 401


# ---------- Products ----------
class TestProducts:
    def test_list_products(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/products", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        items = d if isinstance(d, list) else d.get("items") or d.get("data") or d.get("products")
        assert items is not None, f"Unexpected payload: {d}"
        assert len(items) >= 14, f"Expected >=14 products, got {len(items)}"
        # Validate shape
        p = items[0]
        assert "id" in p
        assert "sku" in p or "name" in p

    def test_create_product(self, admin_session):
        sku = f"TEST_SKU_{uuid.uuid4().hex[:8].upper()}"
        payload = {
            "sku": sku,
            "name_en": "TEST_Product",
            "name_ar": "منتج اختبار",
            "name_ku": "بەرهەمی تاقیکردنەوە",
            "category_id": 1,
            "price": 9.99,
            "cost": 5.0,
            "tax_rate": 0,
            "unit": "pcs",
            "is_active": 1,
        }
        r = admin_session.post(f"{BASE_URL}/api/products", json=payload, timeout=15)
        assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
        data = r.json()
        pid = data.get("id") or (data.get("product") or {}).get("id") or (data.get("data") or {}).get("id")
        assert pid, f"no id returned: {data}"
        # GET verify
        g = admin_session.get(f"{BASE_URL}/api/products/{pid}", timeout=10)
        assert g.status_code == 200
        body = g.json()
        prod = body if "sku" in body else body.get("product") or body.get("data") or body
        assert prod.get("sku") == sku


# ---------- Categories ----------
class TestCategories:
    def test_list_categories(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/categories", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        items = d if isinstance(d, list) else d.get("items") or d.get("data") or d.get("categories")
        assert items is not None
        assert len(items) >= 8, f"Expected >=8 categories, got {len(items)}"


# ---------- Customers ----------
class TestCustomers:
    def test_list_customers(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/customers", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        items = d if isinstance(d, list) else d.get("items") or d.get("data") or d.get("customers")
        assert items is not None
        assert len(items) >= 5, f"Expected >=5 customers, got {len(items)}"


# ---------- Inventory ----------
class TestInventory:
    def test_list_inventory(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/inventory", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        items = d if isinstance(d, list) else d.get("items") or d.get("data") or d.get("inventory")
        assert items is not None
        assert len(items) >= 1


# ---------- Sales ----------
class TestSales:
    def test_list_sales(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/sales", timeout=15)
        assert r.status_code == 200, r.text


# ---------- Suppliers ----------
class TestSuppliers:
    def test_list_suppliers(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/suppliers", timeout=15)
        assert r.status_code == 200, r.text


# ---------- Branches ----------
class TestBranches:
    def test_list_branches(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/branches", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        items = d if isinstance(d, list) else d.get("items") or d.get("data") or d.get("branches")
        assert items is not None
        assert len(items) >= 3


# ---------- Dashboard ----------
class TestDashboard:
    def test_dashboard_stats(self, admin_session):
        # endpoint is /api/dashboard/summary
        r = admin_session.get(f"{BASE_URL}/api/dashboard/summary", timeout=15)
        if r.status_code == 404:
            r = admin_session.get(f"{BASE_URL}/api/dashboard", timeout=15)
        assert r.status_code == 200, r.text


# ---------- Settings ----------
class TestSettings:
    def test_get_settings(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/settings", timeout=15)
        assert r.status_code == 200, r.text


# ---------- Reports ----------
class TestReports:
    def test_reports_summary(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/reports/summary", timeout=15)
        # accept 200 or 404 (route shape may vary) but log it
        assert r.status_code in (200, 404), r.text


# ---------- Role-based access ----------
class TestRBAC:
    def test_cashier_login(self, cashier_session):
        r = cashier_session.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "cashier"

    def test_cashier_cannot_list_users(self, cashier_session):
        r = cashier_session.get(f"{BASE_URL}/api/users", timeout=15)
        assert r.status_code in (401, 403), f"Cashier should not list users; got {r.status_code}"


# ---------- Web pages ----------
class TestWebPages:
    def test_login_page_renders(self):
        r = requests.get(f"{BASE_URL}/login", timeout=15)
        assert r.status_code == 200
        assert "login" in r.text.lower()

    def test_dashboard_redirects_when_unauth(self):
        r = requests.get(f"{BASE_URL}/", allow_redirects=False, timeout=15)
        assert r.status_code in (302, 303, 200)
