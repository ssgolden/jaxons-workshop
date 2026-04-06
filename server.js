const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');

// Import database (auto-initializes on load)
const { queries, db } = require('./config/database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('trust proxy', 1);

// Store io reference for routes
app.set('io', io);

const PORT = process.env.PORT || 3006;

// Middleware
app.use(bodyParser.json({ limit: '25mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '25mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '.')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Import routes
const adminRoutes = require('./routes/admin');

function formatCategoryLabel(slug = '') {
    if (slug === '3dprints') return '3D Prints';
    if (slug === 'waxmelts') return 'Wax Melts';

    return slug
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function safeJsonParse(value, fallback) {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch (error) {
        return fallback;
    }
}

function getStoreSettingsMap() {
    const settings = queries.getAllSettings.all();
    return settings.reduce((acc, setting) => {
        acc[setting.setting_key] = setting.setting_value;
        return acc;
    }, {});
}

function getNumberSetting(settings, key, fallback) {
    const parsed = Number.parseFloat(settings[key]);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function createOrderNumber() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = `JX${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
        if (!queries.getOrderByNumber.get(candidate)) {
            return candidate;
        }
    }

    throw new Error('Failed to generate a unique order number');
}

// API Routes
app.use('/api/admin', adminRoutes);

// Public API - Products (for frontend)
app.get('/api/menu', (req, res) => {
    try {
        const products = queries.getActiveProducts.all();
        const categories = db.prepare(`
            SELECT name, slug
            FROM categories
            WHERE active = 1 AND is_menu = 1
            ORDER BY position ASC, name ASC
        `).all();
        const menu = {};

        categories.forEach(category => {
            menu[category.name] = [];
        });

        products.forEach(product => {
            const matchingCategory = categories.find(category => category.slug === product.category);
            const category = matchingCategory?.name || formatCategoryLabel(product.category);
            const metadata = safeJsonParse(product.metadata, {});

            if (!menu[category]) {
                menu[category] = [];
            }

            menu[category].push({
                id: product.id,
                name: product.name,
                desc: product.short_description || product.description || '',
                price: product.price,
                category: product.category,
                images: safeJsonParse(product.images, []),
                inventory: product.inventory_quantity,
                metadata
            });
        });

        res.json(menu);
    } catch (error) {
        console.error('Menu API error:', error);
        // Fallback menu if database fails
        res.json({
            'Candles': [
                { name: 'Vanilla Dream', desc: 'Warm & cozy vanilla scent', price: 8.5, category: 'candles' },
                { name: 'Lavender Calm', desc: 'Relaxing lavender', price: 8.5, category: 'candles' },
                { name: 'Citrus Burst', desc: 'Fresh orange & lemon', price: 8.5, category: 'candles' }
            ],
            'Wax Melts': [
                { name: 'Vanilla Cubes', desc: '6 soy wax cubes', price: 4.5, category: 'waxmelts' },
                { name: 'Lavender Relax', desc: '6 soy wax cubes', price: 4.5, category: 'waxmelts' }
            ],
            '3D Prints': [
                { name: 'Custom Keychain', desc: 'Personalised 3D printed keychain', price: 3, category: '3dprints' },
                { name: 'Phone Stand', desc: 'Sleek 3D printed phone stand', price: 6, category: '3dprints' }
            ]
        });
    }
});

app.get('/api/store-settings', (req, res) => {
    try {
        const settings = queries.getAllSettings.all();
        const settingsObj = {};
        const publicKeys = new Set([
            'store_name',
            'currency_symbol',
            'free_shipping_threshold',
            'delivery_fee',
            'pickup_ready_time',
            'delivery_time_text',
            'home_hero_subtitle',
            'home_featured_heading',
            'home_featured_subtitle',
            'home_custom_title',
            'home_custom_text'
        ]);

        settings.forEach(setting => {
            if (publicKeys.has(setting.setting_key)) {
                settingsObj[setting.setting_key] = setting.setting_value;
            }
        });

        res.json({ settings: settingsObj });
    } catch (error) {
        console.error('Store settings API error:', error);
        res.status(500).json({ error: 'Failed to load store settings' });
    }
});

// Seed menu endpoint (for backwards compatibility)
app.post('/api/seed-menu', (req, res) => {
    res.json({ success: true, message: 'Menu seeded' });
});

// Create order endpoint
app.post('/api/orders', (req, res) => {
    try {
        const {
            items, customer_name, email, phone,
            address, city, postalCode, order_type, payment_method,
            special_instructions, table_number
        } = req.body;

        if (!customer_name?.trim()) {
            return res.status(400).json({ error: 'Customer name is required' });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Your cart is empty' });
        }

        const normalizedOrderType = order_type === 'delivery' ? 'delivery' : 'pickup';
        if (normalizedOrderType === 'delivery' && (!address?.trim() || !city?.trim() || !postalCode?.trim())) {
            return res.status(400).json({ error: 'Delivery orders require a full address' });
        }

        const requestedQuantities = new Map();
        for (const rawItem of items) {
            const productId = Number.parseInt(rawItem?.id ?? rawItem?.product_id, 10);
            const quantity = Number.parseInt(rawItem?.quantity, 10);

            if (!Number.isInteger(productId) || productId <= 0) {
                return res.status(400).json({ error: 'One or more cart items are invalid. Please refresh and try again.' });
            }

            if (!Number.isInteger(quantity) || quantity <= 0) {
                return res.status(400).json({ error: 'One or more item quantities are invalid' });
            }

            requestedQuantities.set(productId, (requestedQuantities.get(productId) || 0) + quantity);
        }

        const productIds = [...requestedQuantities.keys()];
        const placeholders = productIds.map(() => '?').join(', ');
        const products = db.prepare(`
            SELECT id, name, short_description, description, price, category, inventory_quantity, track_inventory, status, images
            FROM products
            WHERE id IN (${placeholders})
        `).all(...productIds);
        const productMap = new Map(products.map(product => [product.id, product]));

        if (productMap.size !== productIds.length) {
            return res.status(400).json({ error: 'Some products are no longer available. Please refresh your cart.' });
        }

        const orderItems = [];
        let subtotal = 0;

        for (const [productId, quantity] of requestedQuantities.entries()) {
            const product = productMap.get(productId);

            if (!product || product.status !== 'active') {
                return res.status(400).json({ error: `${product?.name || 'An item'} is no longer available` });
            }

            if (product.track_inventory && quantity > product.inventory_quantity) {
                return res.status(400).json({ error: `${product.name} only has ${product.inventory_quantity} left` });
            }

            const unitPrice = Number.parseFloat(product.price);
            const lineTotal = unitPrice * quantity;
            const images = safeJsonParse(product.images, []);

            subtotal += lineTotal;
            orderItems.push({
                product_id: product.id,
                name: product.name,
                description: product.short_description || product.description || '',
                category: product.category,
                quantity,
                price: unitPrice,
                unit_price: unitPrice,
                line_total: Number(lineTotal.toFixed(2)),
                image: images[0] || null
            });
        }

        const settings = getStoreSettingsMap();
        const freeShippingThreshold = getNumberSetting(settings, 'free_shipping_threshold', 50);
        const deliveryFee = getNumberSetting(settings, 'delivery_fee', 5);
        const shippingCost = normalizedOrderType === 'delivery' && subtotal < freeShippingThreshold ? deliveryFee : 0;
        const finalTotal = Number((subtotal + shippingCost).toFixed(2));
        const normalizedPaymentMethod = normalizedOrderType === 'delivery' ? 'pay_delivery' : 'cash_pickup';
        const decrementInventory = db.prepare(`
            UPDATE products
            SET inventory_quantity = inventory_quantity - ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND track_inventory = 1
        `);

        const savedOrder = db.transaction(() => {
            const orderNumber = createOrderNumber();
            const result = queries.createOrder.run(
                orderNumber,
                'new',
                'pending',
                'unfulfilled',
                customer_name.trim(),
                email || '',
                phone || '',
                address || '',
                city || '',
                postalCode || '',
                normalizedOrderType,
                payment_method === normalizedPaymentMethod ? payment_method : normalizedPaymentMethod,
                Number(subtotal.toFixed(2)),
                Number(shippingCost.toFixed(2)),
                0,
                finalTotal,
                special_instructions || '',
                table_number || null,
                JSON.stringify(orderItems)
            );

            orderItems.forEach(item => {
                const product = productMap.get(item.product_id);
                if (product?.track_inventory) {
                    decrementInventory.run(item.quantity, item.product_id);
                }
            });

            return {
                id: result.lastInsertRowid,
                orderNumber
            };
        })();

        // Emit real-time event
        io.emit('order:new', {
            id: savedOrder.id,
            order_number: savedOrder.orderNumber,
            total: finalTotal,
            customer_name: customer_name.trim()
        });

        // Track analytics event
        try {
            queries.createEvent.run(
                'checkout_completed',
                req.headers['user-agent'],
                JSON.stringify({
                    order_number: savedOrder.orderNumber,
                    total: finalTotal,
                    items: orderItems.reduce((count, item) => count + item.quantity, 0)
                })
            );
        } catch (e) {
            console.error('Analytics error:', e);
        }

        res.json({
            success: true,
            id: savedOrder.id,
            order_number: savedOrder.orderNumber,
            subtotal: Number(subtotal.toFixed(2)),
            shipping_cost: Number(shippingCost.toFixed(2)),
            total: finalTotal
        });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ error: error.message || 'Failed to create order' });
    }
});

// Get order by number
app.get('/api/orders/:orderNumber', (req, res) => {
    try {
        const order = queries.getOrderByNumber.get(req.params.orderNumber);
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

// Track analytics events
app.post('/api/analytics', (req, res) => {
    try {
        const { event_type, session_id, data } = req.body;
        queries.createEvent.run(
            event_type,
            session_id || '',
            JSON.stringify(data || {})
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to track event' });
    }
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });

    // Join admin room for real-time updates
    socket.on('join:admin', () => {
        socket.join('admin');
        console.log('Client joined admin room');
    });
});

// Serve admin dashboard
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// Serve main site for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
server.listen(PORT, () => {
    console.log(`Jaxon's Workshop server running on http://localhost:${PORT}`);
    console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down server...');
    db.close();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});



