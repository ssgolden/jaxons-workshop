const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'database', 'jaxons.db');

// Ensure database directory exists
if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema IMMEDIATELY
function initDatabase() {
    // Staff users table
    db.exec(`
        CREATE TABLE IF NOT EXISTS staff_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT DEFAULT 'staff' CHECK(role IN ('owner', 'staff', 'viewer')),
            pin TEXT,
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Products table
    db.exec(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            short_description TEXT,
            price REAL NOT NULL,
            compare_price REAL,
            cost REAL,
            sku TEXT,
            barcode TEXT,
            category TEXT NOT NULL,
            inventory_quantity INTEGER DEFAULT 0,
            track_inventory INTEGER DEFAULT 1,
            low_stock_threshold INTEGER DEFAULT 5,
            status TEXT DEFAULT 'active' CHECK(status IN ('draft', 'active', 'archived')),
            images TEXT DEFAULT '[]',
            metadata TEXT DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Categories/Menus table
    db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            description TEXT,
            parent_id INTEGER,
            icon TEXT DEFAULT '',
            position INTEGER DEFAULT 0,
            is_menu INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
        )
    `);

    // Insert default categories
    const defaultCategories = [
        { name: 'Candles', slug: 'candles', icon: 'local_fire_department', position: 1, is_menu: 1 },
        { name: 'Wax Melts', slug: 'waxmelts', icon: 'spa', position: 2, is_menu: 1 },
        { name: '3D Prints', slug: '3dprints', icon: 'print', position: 3, is_menu: 1 },
    ];

    const insertCategory = db.prepare(`
        INSERT OR IGNORE INTO categories (name, slug, icon, position, is_menu) VALUES (?, ?, ?, ?, ?)
    `);

    defaultCategories.forEach(cat => {
        insertCategory.run(cat.name, cat.slug, cat.icon, cat.position, cat.is_menu);
    });

    // Product variants table
    db.exec(`
        CREATE TABLE IF NOT EXISTS product_variants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            option_name TEXT NOT NULL,
            option_value TEXT NOT NULL,
            price REAL,
            sku TEXT,
            inventory INTEGER DEFAULT 0,
            position INTEGER DEFAULT 0,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )
    `);

    // Orders table (enhanced)
    db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_number TEXT UNIQUE NOT NULL,
            status TEXT DEFAULT 'new' CHECK(status IN ('new', 'confirmed', 'processing', 'ready', 'fulfilled', 'completed', 'cancelled')),
            payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending', 'authorized', 'paid', 'partially_refunded', 'refunded')),
            fulfillment_status TEXT DEFAULT 'unfulfilled' CHECK(fulfillment_status IN ('unfulfilled', 'partial', 'fulfilled')),
            customer_name TEXT NOT NULL,
            customer_email TEXT,
            phone TEXT,
            address TEXT,
            city TEXT,
            postal_code TEXT,
            order_type TEXT NOT NULL CHECK(order_type IN ('pickup', 'delivery')),
            payment_method TEXT DEFAULT 'cash' CHECK(payment_method IN ('card', 'cash_pickup', 'pay_delivery', 'stripe')),
            stripe_payment_intent_id TEXT,
            subtotal REAL NOT NULL,
            shipping_cost REAL DEFAULT 0,
            discount REAL DEFAULT 0,
            total REAL NOT NULL,
            special_instructions TEXT,
            table_number INTEGER,
            num_people INTEGER DEFAULT 1,
            internal_notes TEXT,
            items TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            fulfilled_at DATETIME
        )
    `);

    // Analytics events table
    db.exec(`
        CREATE TABLE IF NOT EXISTS analytics_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            session_id TEXT,
            data TEXT DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Plugin settings table
    db.exec(`
        CREATE TABLE IF NOT EXISTS plugin_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plugin_key TEXT UNIQUE NOT NULL,
            plugin_name TEXT NOT NULL,
            enabled INTEGER DEFAULT 0,
            settings_json TEXT DEFAULT '{}',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Store settings table
    db.exec(`
        CREATE TABLE IF NOT EXISTS store_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            setting_key TEXT UNIQUE NOT NULL,
            setting_value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create indexes for performance
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
        CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
        CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
    `);

    // Insert default store settings
    const defaultSettings = [
        { key: 'store_name', value: "Jaxon's Workshop" },
        { key: 'currency', value: 'EUR' },
        { key: 'currency_symbol', value: '€' },
        { key: 'free_shipping_threshold', value: '50' },
        { key: 'delivery_fee', value: '5' },
        { key: 'pickup_ready_time', value: '2' },
        { key: 'delivery_time_text', value: '2-4 business days' },
        { key: 'home_hero_subtitle', value: 'Beautiful soy candles, delightful wax melts & custom 3D prints — all handmade with love by me!' },
        { key: 'home_featured_heading', value: '🔥 Popular Items' },
        { key: 'home_featured_subtitle', value: 'Handpicked favorites that everyone loves' },
        { key: 'home_custom_title', value: 'Need a personalized gift or custom 3D print?' },
        { key: 'home_custom_text', value: 'Even without a full custom-order form yet, you can still order something personal. Add your idea in the checkout notes and Jaxon can follow up on names, colors, scents, and simple custom requests.' },
        { key: 'stripe_enabled', value: '0' },
        { key: 'stripe_public_key', value: '' },
        { key: 'stripe_secret_key', value: '' },
    ];

    const insertSetting = db.prepare(`
        INSERT OR IGNORE INTO store_settings (setting_key, setting_value) VALUES (?, ?)
    `);

    defaultSettings.forEach(setting => {
        insertSetting.run(setting.key, setting.value);
    });

    // Optionally seed an initial owner account from environment variables.
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
        const bcrypt = require('bcrypt');
        const adminHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);

        db.prepare(`
            INSERT OR IGNORE INTO staff_users (email, password_hash, name, role, pin)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            process.env.ADMIN_EMAIL,
            adminHash,
            process.env.ADMIN_NAME || 'Admin',
            'owner',
            process.env.ADMIN_PIN || null
        );
    }

    console.log('Database initialized successfully');
}

// Run initialization BEFORE defining queries
initDatabase();

// Helper queries - created AFTER tables exist
const queries = {
    // Products
    getAllProducts: db.prepare('SELECT * FROM products ORDER BY created_at DESC'),
    getProductById: db.prepare('SELECT * FROM products WHERE id = ?'),
    getProductsByCategory: db.prepare("SELECT * FROM products WHERE category = ? AND status = 'active'"),
    getActiveProducts: db.prepare("SELECT * FROM products WHERE status = 'active' ORDER BY category, name"),
    createProduct: db.prepare(`
        INSERT INTO products (name, description, short_description, price, compare_price, cost, sku, barcode, category, inventory_quantity, track_inventory, low_stock_threshold, status, images, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateProduct: db.prepare(`
        UPDATE products
        SET name = ?, description = ?, short_description = ?, price = ?, compare_price = ?, cost = ?, sku = ?, barcode = ?, category = ?, inventory_quantity = ?, track_inventory = ?, low_stock_threshold = ?, status = ?, images = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `),
    deleteProduct: db.prepare('DELETE FROM products WHERE id = ?'),
    getLowStockProducts: db.prepare('SELECT * FROM products WHERE inventory_quantity <= low_stock_threshold AND track_inventory = 1'),

    // Orders
    getAllOrders: db.prepare('SELECT * FROM orders ORDER BY created_at DESC'),
    getOrderById: db.prepare('SELECT * FROM orders WHERE id = ?'),
    getOrderByNumber: db.prepare('SELECT * FROM orders WHERE order_number = ?'),
    getOrdersByStatus: db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC'),
    createOrder: db.prepare(`
        INSERT INTO orders (order_number, status, payment_status, fulfillment_status, customer_name, customer_email, phone, address, city, postal_code, order_type, payment_method, subtotal, shipping_cost, discount, total, special_instructions, table_number, items)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateOrderStatus: db.prepare(`
        UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `),
    updateOrderPaymentStatus: db.prepare(`
        UPDATE orders SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `),
    updateOrderFulfillment: db.prepare(`
        UPDATE orders SET fulfillment_status = ?, fulfilled_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `),

    // Analytics
    createEvent: db.prepare(`
        INSERT INTO analytics_events (event_type, session_id, data) VALUES (?, ?, ?)
    `),
    getEventsByType: db.prepare('SELECT * FROM analytics_events WHERE event_type = ? ORDER BY created_at DESC LIMIT 100'),

    // Store Settings
    getSetting: db.prepare('SELECT * FROM store_settings WHERE setting_key = ?'),
    getAllSettings: db.prepare('SELECT * FROM store_settings'),
    updateSetting: db.prepare(`
        UPDATE store_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?
    `),

    // Staff
    getStaffByEmail: db.prepare('SELECT * FROM staff_users WHERE email = ? AND active = 1'),
    getStaffByPin: db.prepare('SELECT * FROM staff_users WHERE pin = ? AND active = 1'),
    getAllStaff: db.prepare('SELECT id, email, name, role, active, created_at FROM staff_users'),
    createStaff: db.prepare(`
        INSERT INTO staff_users (email, password_hash, name, role, pin) VALUES (?, ?, ?, ?, ?)
    `),
    updateStaff: db.prepare(`
        UPDATE staff_users SET email = ?, name = ?, role = ?, pin = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `),
};

module.exports = {
    db,
    initDatabase,
    queries,
};

