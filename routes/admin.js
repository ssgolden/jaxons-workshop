const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { queries, initDatabase } = require('../config/database');
const { authMiddleware, roleMiddleware, loginWithEmail, loginWithPin } = require('../middleware/auth');
const { upload, optimizeImages } = require('../middleware/upload');

function parseJsonField(value, fallback) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    if (typeof value !== 'string') {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function parseBoolean(value) {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number') {
        return value !== 0;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized)) {
            return true;
        }
        if (['false', '0', 'no', 'off', ''].includes(normalized)) {
            return false;
        }
    }

    return Boolean(value);
}

function buildProductPayload(req) {
    const rawBody = req.body || {};
    const metadata = parseJsonField(rawBody.metadata, {});
    const existingImages = parseJsonField(rawBody.images, []);
    const uploadedImages = Array.isArray(req.optimizedFiles) ? req.optimizedFiles : [];
    const productImages = [
        ...(Array.isArray(existingImages) ? existingImages : []),
        ...uploadedImages
    ];

    return {
        name: rawBody.name,
        description: rawBody.description || '',
        short_description: rawBody.short_description || '',
        price: rawBody.price,
        compare_price: rawBody.compare_price,
        cost: rawBody.cost,
        sku: rawBody.sku || '',
        barcode: rawBody.barcode || '',
        category: rawBody.category,
        inventory_quantity: rawBody.inventory_quantity,
        track_inventory: parseBoolean(rawBody.track_inventory),
        low_stock_threshold: rawBody.low_stock_threshold,
        status: rawBody.status || 'active',
        images: productImages,
        metadata
    };
}

// ===== AUTHENTICATION =====

router.post('/login', async (req, res) => {
    try {
        const { email, password, pin } = req.body;

        let result;
        if (pin) {
            result = await loginWithPin(pin);
        } else if (email && password) {
            result = await loginWithEmail(email, password);
        } else {
            return res.status(400).json({ error: 'Email/password or PIN required' });
        }

        if (result.success) {
            res.cookie('token', result.token, {
                httpOnly: true,
                sameSite: 'lax',
                secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
                maxAge: 24 * 60 * 60 * 1000
            });

            res.json({
                success: true,
                user: result.user
            });
        } else {
            res.status(401).json({ error: result.error });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        sameSite: 'lax',
        secure: req.secure || req.headers['x-forwarded-proto'] === 'https'
    });
    res.json({ success: true });
});

router.get('/me', authMiddleware, (req, res) => {
    res.json({
        user: {
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            role: req.user.role
        }
    });
});

// ===== PRODUCTS =====

router.get('/products', authMiddleware, (req, res) => {
    try {
        const products = queries.getAllProducts.all();
        res.json({ products });
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ error: 'Failed to get products' });
    }
});

router.get('/products/active', (req, res) => {
    try {
        const products = queries.getActiveProducts.all();
        res.json({ products });
    } catch (error) {
        console.error('Get active products error:', error);
        res.status(500).json({ error: 'Failed to get products' });
    }
});

router.get('/products/:id', authMiddleware, (req, res) => {
    try {
        const product = queries.getProductById.get(req.params.id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ product });
    } catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({ error: 'Failed to get product' });
    }
});

router.post('/products', authMiddleware, upload.array('images', 10), optimizeImages, (req, res) => {
    try {
        const productData = buildProductPayload(req);

        const {
            name, description, short_description, price, compare_price, cost,
            sku, barcode, category, inventory_quantity, track_inventory,
            low_stock_threshold, status, images, metadata
        } = productData;

        // Validate required fields
        if (!name || !price || !category) {
            return res.status(400).json({ error: 'Name, price, and category are required' });
        }

        const result = queries.createProduct.run(
            name,
            description || '',
            short_description || '',
            parseFloat(price),
            parseFloat(compare_price) || null,
            parseFloat(cost) || null,
            sku || '',
            barcode || '',
            category,
            parseInt(inventory_quantity) || 0,
            track_inventory ? 1 : 0,
            parseInt(low_stock_threshold) || 5,
            status || 'active',
            JSON.stringify(images),
            JSON.stringify(metadata)
        );

        res.json({
            success: true,
            product: {
                id: result.lastInsertRowid,
                name,
                category,
                price: parseFloat(price),
                images
            }
        });
    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({ error: 'Failed to create product' });
    }
});

router.put('/products/:id', authMiddleware, upload.array('images', 10), optimizeImages, (req, res) => {
    try {
        const productData = buildProductPayload(req);
        const {
            name, description, short_description, price, compare_price, cost,
            sku, barcode, category, inventory_quantity, track_inventory,
            low_stock_threshold, status, images, metadata
        } = productData;

        const result = queries.updateProduct.run(
            name,
            description || '',
            short_description || '',
            parseFloat(price),
            parseFloat(compare_price) || null,
            parseFloat(cost) || null,
            sku || '',
            barcode || '',
            category,
            parseInt(inventory_quantity) || 0,
            track_inventory ? 1 : 0,
            parseInt(low_stock_threshold) || 5,
            status || 'active',
            JSON.stringify(Array.isArray(images) ? images : []),
            JSON.stringify(metadata || {}),
            req.params.id
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

router.delete('/products/:id', authMiddleware, (req, res) => {
    try {
        const result = queries.deleteProduct.run(req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// ===== ORDERS =====

router.get('/orders', authMiddleware, (req, res) => {
    try {
        const { status } = req.query;
        let orders;

        if (status) {
            orders = queries.getOrdersByStatus.all(status);
        } else {
            orders = queries.getAllOrders.all();
        }

        // Parse items JSON
        orders = orders.map(order => ({
            ...order,
            items: JSON.parse(order.items)
        }));

        res.json({ orders });
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ error: 'Failed to get orders' });
    }
});

router.get('/orders/:id', authMiddleware, (req, res) => {
    try {
        const order = queries.getOrderById.get(req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        order.items = JSON.parse(order.items);
        res.json({ order });
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({ error: 'Failed to get order' });
    }
});

router.put('/orders/:id/status', authMiddleware, (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['new', 'confirmed', 'processing', 'ready', 'fulfilled', 'completed', 'cancelled'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const result = queries.updateOrderStatus.run(status, req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Emit socket event for real-time update
        if (req.app.get('io')) {
            req.app.get('io').emit('order:updated', { id: req.params.id, status });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({ error: 'Failed to update order' });
    }
});

router.put('/orders/:id/fulfillment', authMiddleware, (req, res) => {
    try {
        const { fulfillment_status } = req.body;
        const validStatuses = ['unfulfilled', 'partial', 'fulfilled'];

        if (!validStatuses.includes(fulfillment_status)) {
            return res.status(400).json({ error: 'Invalid fulfillment status' });
        }

        const fulfilled_at = fulfillment_status === 'fulfilled' ? new Date().toISOString() : null;
        const result = queries.updateOrderFulfillment.run(fulfillment_status, fulfilled_at, req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Update fulfillment error:', error);
        res.status(500).json({ error: 'Failed to update fulfillment' });
    }
});

// ===== ANALYTICS =====

router.get('/analytics/summary', authMiddleware, (req, res) => {
    try {
        const db = require('../config/database').db;

        // Total sales
        const totalSales = db.prepare("SELECT SUM(total) as total, COUNT(*) as count FROM orders WHERE status != 'cancelled'").get();

        // Sales by status
        const salesByStatus = db.prepare(`
            SELECT status, COUNT(*) as count, SUM(total) as total
            FROM orders
            GROUP BY status
        `).all();

        // Top products
        const orderItems = db.prepare(`
            SELECT items
            FROM orders
            WHERE status != 'cancelled'
        `).all();
        const productMap = new Map();

        orderItems.forEach(order => {
            const items = JSON.parse(order.items || '[]');
            items.forEach(item => {
                const name = item.name || 'Unnamed product';
                const quantity = Number(item.quantity || 1);
                const revenue = Number(item.price || 0) * quantity;
                const current = productMap.get(name) || { name, quantity: 0, revenue: 0 };
                current.quantity += quantity;
                current.revenue += revenue;
                productMap.set(name, current);
            });
        });

        const topProducts = Array.from(productMap.values())
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        // Recent orders
        const recentOrders = db.prepare(`
            SELECT id, order_number, customer_name, total, status, created_at
            FROM orders
            ORDER BY created_at DESC
            LIMIT 10
        `).all();

        // Low stock products
        const lowStock = queries.getLowStockProducts.all();

        res.json({
            totalSales: totalSales.total || 0,
            totalOrders: totalSales.count || 0,
            salesByStatus,
            topProducts,
            recentOrders,
            lowStock
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to get analytics' });
    }
});

router.get('/analytics/sales-chart', authMiddleware, (req, res) => {
    try {
        const { period = '7days' } = req.query;
        const db = require('../config/database').db;

        let days = 7;
        if (period === '30days') days = 30;
        if (period === '90days') days = 90;

        const salesData = db.prepare(`
            SELECT DATE(created_at) as date,
                   COUNT(*) as orders,
                   SUM(total) as revenue
            FROM orders
            WHERE created_at >= DATE('now', ?)
            AND status != 'cancelled'
            GROUP BY DATE(created_at)
            ORDER BY date
        `).all(`-${days} days`);

        res.json({ salesData });
    } catch (error) {
        console.error('Sales chart error:', error);
        res.status(500).json({ error: 'Failed to get sales data' });
    }
});

// ===== STAFF MANAGEMENT =====

router.get('/staff', authMiddleware, roleMiddleware('owner'), (req, res) => {
    try {
        const staff = queries.getAllStaff.all();
        res.json({ staff });
    } catch (error) {
        console.error('Get staff error:', error);
        res.status(500).json({ error: 'Failed to get staff' });
    }
});

router.post('/staff', authMiddleware, roleMiddleware('owner'), async (req, res) => {
    try {
        const { email, password, name, role, pin } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name required' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const result = queries.createStaff.run(email, passwordHash, name, role || 'staff', pin || null);

        res.json({
            success: true,
            staff: {
                id: result.lastInsertRowid,
                email,
                name,
                role
            }
        });
    } catch (error) {
        console.error('Create staff error:', error);
        if (error.code === 'SQLITE_CONSTRAINT') {
            return res.status(400).json({ error: 'Email already exists' });
        }
        res.status(500).json({ error: 'Failed to create staff' });
    }
});

// ===== MENU/CATEGORY MANAGEMENT =====

router.get('/categories', authMiddleware, (req, res) => {
    try {
        const db = require('../config/database').db;
        const categories = db.prepare(`
            SELECT c.*,
                   COUNT(p.id) as product_count,
                   SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END) as active_count
            FROM categories c
            LEFT JOIN products p ON p.category = c.slug
            GROUP BY c.id
            ORDER BY c.position, c.name
        `).all();
        res.json({ categories });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Failed to get categories' });
    }
});

router.post('/categories', authMiddleware, (req, res) => {
    try {
        const { name, slug, description, parent_id, icon, position } = req.body;

        if (!name || !slug) {
            return res.status(400).json({ error: 'Name and slug are required' });
        }

        const db = require('../config/database').db;
        const result = db.prepare(`
            INSERT INTO categories (name, slug, description, parent_id, icon, position)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(name, slug, description || '', parent_id || null, icon || '', position || 0);

        res.json({
            success: true,
            category: {
                id: result.lastInsertRowid,
                name,
                slug,
                description,
                parent_id,
                icon,
                position
            }
        });
    } catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({ error: 'Failed to create category' });
    }
});

router.put('/categories/:id', authMiddleware, (req, res) => {
    try {
        const { name, slug, description, parent_id, icon, position, is_menu } = req.body;

        const db = require('../config/database').db;
        const result = db.prepare(`
            UPDATE categories
            SET name = ?, slug = ?, description = ?, parent_id = ?, icon = ?, position = ?, is_menu = ?
            WHERE id = ?
        `).run(name, slug, description || '', parent_id || null, icon || '', position || 0, is_menu ? 1 : 0, req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({ error: 'Failed to update category' });
    }
});

router.delete('/categories/:id', authMiddleware, (req, res) => {
    try {
        const db = require('../config/database').db;
        const result = db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ error: 'Failed to delete category' });
    }
});

// ===== STORE SETTINGS =====

router.get('/settings', authMiddleware, (req, res) => {
    try {
        const settings = queries.getAllSettings.all();
        const settingsObj = {};
        settings.forEach(s => settingsObj[s.setting_key] = s.setting_value);
        res.json({ settings: settingsObj });
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

router.put('/settings', authMiddleware, (req, res) => {
    try {
        const updates = req.body;
        const updateSetting = queries.updateSetting;

        for (const [key, value] of Object.entries(updates)) {
            updateSetting.run(value.toString(), key);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

module.exports = router;
