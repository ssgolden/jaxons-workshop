window.jaxonshop = function() {
    return {
        // View state
        view: 'home',
        isLoading: true,
        isDrawerOpen: false,
        activeCategory: 'Candles',
        selectedProduct: null,
        searchQuery: '',
        sortOption: 'featured',

        // Checkout state
        checkoutStep: 1,  // 1=cart, 2=information, 3=shipping, 4=payment, 5=complete
        checkoutData: {
            email: '',
            name: '',
            phone: '',
            address: '',
            city: '',
            postalCode: '',
            paymentMethod: 'cash_pickup',
            agreeTerms: false
        },
        errors: {},
        isProcessing: false,

        // Cart state
        cart: JSON.parse(localStorage.getItem('jaxons_cart')) || [],
        orderType: 'pickup',
        checkoutForm: {
            name: '',
            phone: ''
        },
        specialInstructions: '',
        orderSuccess: null,
        toasts: [],

        // Menu state
        fullMenu: {},
        storeSettings: {},
        tableNumber: null,
        isTableLocked: false,

        // Computed properties
        get cartTotal() {
            return this.cart.reduce((sum, item) => sum + (parseFloat(item.price) * (item.quantity || 1)), 0);
        },

        get currencySymbol() {
            return this.settingValue('currency_symbol', '€');
        },

        get cartCount() {
            return this.cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
        },

        get freeShippingThreshold() {
            return this.numberSettingValue('free_shipping_threshold', 50);
        },

        get deliveryFeeAmount() {
            return this.numberSettingValue('delivery_fee', 5);
        },

        get pickupReadyTimeHours() {
            return this.numberSettingValue('pickup_ready_time', 2);
        },

        get deliveryTimeText() {
            return this.settingValue('delivery_time_text', '2-4 business days');
        },

        get deliveryFee() {
            return this.orderType === 'delivery' && this.cartTotal < this.freeShippingThreshold ? this.deliveryFeeAmount : 0;
        },

        get orderTotal() {
            return this.cartTotal + this.deliveryFee;
        },

        get canProceedToInfo() {
            return this.cart.length > 0;
        },

        get canProceedToShipping() {
            return this.checkoutData.email && this.checkoutData.name && !this.errors.email;
        },

        get canProceedToPayment() {
            if (this.orderType === 'pickup') {
                return this.checkoutData.phone;
            }
            return this.checkoutData.phone && this.checkoutData.address && this.checkoutData.city;
        },

        get canPlaceOrder() {
            return this.checkoutData.agreeTerms;
        },

        // Initialization
        init() {
            const urlParams = new URLSearchParams(window.location.search);
            const tableParam = urlParams.get('table');
            if (tableParam) {
                this.tableNumber = parseInt(tableParam);
                this.isTableLocked = true;
                this.orderType = 'pickup';
            }

            this.$watch('cart', val => localStorage.setItem('jaxons_cart', JSON.stringify(val)));
            this.$watch('checkoutData', val => {
                localStorage.setItem('jaxons_checkout', JSON.stringify(val));
            }, { deep: true });

            // Load saved checkout data
            const savedCheckout = localStorage.getItem('jaxons_checkout');
            if (savedCheckout) {
                this.checkoutData = { ...this.checkoutData, ...JSON.parse(savedCheckout) };
            }

            if (!['cash_pickup', 'pay_delivery'].includes(this.checkoutData.paymentMethod)) {
                this.checkoutData.paymentMethod = this.orderType === 'delivery' ? 'pay_delivery' : 'cash_pickup';
            }

            this.loadStoreSettings();
            this.loadMenu();
        },

        // Menu loading
        async loadMenu() {
            this.isLoading = true;
            try {
                const res = await fetch('/api/menu');
                const menu = await res.json();
                if (menu && Object.keys(menu).length > 0) {
                    this.fullMenu = menu;
                } else {
                    await fetch('/api/seed-menu', { method: 'POST' });
                    const res2 = await fetch('/api/menu');
                    this.fullMenu = await res2.json();
                }
                this.normalizeMenuState();
                this.reconcileCart();
            } catch (e) {
                console.error('Menu load error', e);
                // Fallback menu
                this.fullMenu = {
                    'Candles': [
                        { name: 'Vanilla Dream', price: 12.99, desc: 'Warm vanilla scent', category: 'candles' },
                        { name: 'Ocean Breeze', price: 12.99, desc: 'Fresh coastal aroma', category: 'candles' },
                        { name: 'Lavender Calm', price: 14.99, desc: 'Relaxing lavender', category: 'candles' },
                        { name: 'Citrus Burst', price: 12.99, desc: 'Zesty orange blend', category: 'candles' }
                    ],
                    'Wax Melts': [
                        { name: 'Berry Mix', price: 8.99, desc: 'Mixed berry scent', category: 'waxmelts' },
                        { name: 'Mint Chill', price: 8.99, desc: 'Cool mint aroma', category: 'waxmelts' },
                        { name: 'Peach Delight', price: 8.99, desc: 'Sweet peach scent', category: 'waxmelts' }
                    ],
                    '3D Prints': [
                        { name: 'Custom Keychain', price: 9.99, desc: 'Personalized design', category: '3dprints' },
                        { name: 'Phone Stand', price: 14.99, desc: 'Adjustable holder', category: '3dprints' },
                        { name: 'Desk Organizer', price: 19.99, desc: 'Tidy your space', category: '3dprints' }
                    ]
                };
                this.normalizeMenuState();
                this.reconcileCart();
            }
            this.isLoading = false;
        },

        async loadStoreSettings() {
            try {
                const res = await fetch('/api/store-settings');
                const data = await res.json();
                this.storeSettings = data.settings || {};
            } catch (e) {
                console.error('Store settings load error', e);
                this.storeSettings = {};
            }
        },

        normalizeMenuState() {
            const categories = Object.keys(this.fullMenu);

            categories.forEach(category => {
                const items = Array.isArray(this.fullMenu[category]) ? this.fullMenu[category] : [];
                this.fullMenu[category] = items;
                items.forEach(item => {
                    item.justAdded = false;
                });
            });

            if (!categories.length) {
                this.activeCategory = 'Candles';
                return;
            }

            if (!this.fullMenu[this.activeCategory]) {
                this.activeCategory = this.getDefaultCategory();
            }
        },

        // Formatting
        formatPrice(n) {
            return `${this.currencySymbol}${parseFloat(n || 0).toFixed(2)}`;
        },

        // Cart operations
        addToCart(item) {
            const existing = this.cart.find(i => (i.id && item.id ? i.id === item.id : i.name === item.name));
            if (existing) {
                existing.quantity = (existing.quantity || 1) + 1;
            } else {
                this.cart.push({
                    ...item,
                    quantity: 1,
                    category: item.category || this.activeCategory.toLowerCase().replace(' ', '')
                });
            }
            item.justAdded = true;
            setTimeout(() => { item.justAdded = false; }, 800);
            this.showToast('Added to cart!', 'success');
        },

        removeFromCart(index) {
            this.cart.splice(index, 1);
        },

        qtyIncrease(index) {
            this.cart[index].quantity = (this.cart[index].quantity || 1) + 1;
        },

        qtyDecrease(index) {
            if (this.cart[index].quantity > 1) {
                this.cart[index].quantity--;
            } else {
                this.removeFromCart(index);
            }
        },

        // Navigation
        openCategory(category) {
            this.activeCategory = category;
            this.isDrawerOpen = false;
            this.searchQuery = '';
            this.view = 'shop';
        },

        openProduct(item) {
            this.selectedProduct = item;
        },

        closeProduct() {
            this.selectedProduct = null;
        },

        openFirstCategory() {
            this.openCategory(this.getDefaultCategory());
        },

        goToCart() {
            this.checkoutStep = 1;
            this.view = 'cart';
        },

        goToInformation() {
            if (this.canProceedToInfo) {
                this.checkoutStep = 2;
            } else {
                this.showToast('Your cart is empty!', 'error');
            }
        },

        goToShipping() {
            if (this.validateStep(2)) {
                this.checkoutStep = 3;
            }
        },

        goToPayment() {
            if (this.validateStep(3)) {
                this.checkoutStep = 4;
            }
        },

        // Validation
        validateEmail(email) {
            const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return re.test(email);
        },

        validatePhone(phone) {
            const re = /^[\d\s\+\-\(\)]{10,}$/;
            return re.test(phone);
        },

        validateStep(step) {
            this.errors = {};
            let valid = true;

            if (step === 2) {  // Information step
                if (!this.checkoutData.email) {
                    this.errors.email = 'Email is required';
                    valid = false;
                } else if (!this.validateEmail(this.checkoutData.email)) {
                    this.errors.email = 'Please enter a valid email';
                    valid = false;
                }
                if (!this.checkoutData.name) {
                    this.errors.name = 'Name is required';
                    valid = false;
                }
            }

            if (step === 3) {  // Shipping step
                if (!this.checkoutData.phone) {
                    this.errors.phone = 'Phone is required';
                    valid = false;
                } else if (!this.validatePhone(this.checkoutData.phone)) {
                    this.errors.phone = 'Please enter a valid phone';
                    valid = false;
                }
                if (this.orderType === 'delivery') {
                    if (!this.checkoutData.address) {
                        this.errors.address = 'Address is required';
                        valid = false;
                    }
                    if (!this.checkoutData.city) {
                        this.errors.city = 'City is required';
                        valid = false;
                    }
                    if (!this.checkoutData.postalCode) {
                        this.errors.postalCode = 'Postal code is required';
                        valid = false;
                    }
                }
            }

            if (step === 4) {  // Payment step
                if (!this.checkoutData.agreeTerms) {
                    this.errors.agreeTerms = 'You must agree to the terms';
                    valid = false;
                }
            }

            if (!valid) {
                this.showToast('Please fix the errors above', 'error');
            }

            return valid;
        },

        // Field validation on blur
        validateField(field) {
            if (field === 'email') {
                if (!this.checkoutData.email) {
                    this.errors.email = 'Email is required';
                } else if (!this.validateEmail(this.checkoutData.email)) {
                    this.errors.email = 'Please enter a valid email';
                } else {
                    delete this.errors.email;
                }
            }
            if (field === 'phone') {
                if (this.checkoutData.phone && !this.validatePhone(this.checkoutData.phone)) {
                    this.errors.phone = 'Please enter a valid phone';
                } else {
                    delete this.errors.phone;
                }
            }
        },

        // Toast notifications
        showToast(message, type = 'info') {
            const id = Date.now();
            this.toasts.push({ id, message, type });
            setTimeout(() => {
                this.toasts = this.toasts.filter(t => t.id !== id);
            }, 3000);
        },

        // Order processing
        async processOrder() {
            if (!this.validateStep(4)) {
                return;
            }

            this.isProcessing = true;

            try {
                const res = await fetch('/api/orders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        items: this.cart.map(item => ({
                            id: item.id,
                            quantity: item.quantity || 1
                        })),
                        customer_name: this.checkoutData.name,
                        email: this.checkoutData.email,
                        phone: this.checkoutData.phone,
                        address: this.checkoutData.address,
                        city: this.checkoutData.city,
                        postalCode: this.checkoutData.postalCode,
                        order_type: this.orderType,
                        payment_method: this.checkoutData.paymentMethod,
                        special_instructions: this.specialInstructions,
                        table_number: this.tableNumber
                    })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Order failed');

                // Clear cart and checkout data
                this.cart = [];
                localStorage.removeItem('jaxons_cart');
                localStorage.removeItem('jaxons_checkout');

                this.orderSuccess = {
                    order_number: data.order_number,
                    customer_name: this.checkoutData.name,
                    order_type: this.orderType,
                    total: data.total ?? this.orderTotal,
                    estimatedTime: this.orderTypeEstimate(this.orderType)
                };

                this.checkoutStep = 5;
                this.view = 'success';

            } catch (err) {
                this.showToast('Order failed: ' + err.message, 'error');
            } finally {
                this.isProcessing = false;
            }
        },

        // Menu helpers
        getCategories() {
            return Object.keys(this.fullMenu);
        },

        getItems(category) {
            return this.fullMenu[category] || [];
        },

        settingValue(key, fallback = '') {
            return this.storeSettings[key] || fallback;
        },

        numberSettingValue(key, fallback = 0) {
            const parsed = Number.parseFloat(this.storeSettings[key]);
            return Number.isFinite(parsed) ? parsed : fallback;
        },

        reconcileCart() {
            const liveItems = this.getCategories().flatMap(category => this.getItems(category));

            this.cart = this.cart.map(item => {
                let liveMatch = null;

                if (item.id) {
                    liveMatch = liveItems.find(candidate => candidate.id === item.id);
                }

                if (!liveMatch) {
                    liveMatch = liveItems.find(candidate => candidate.name === item.name && candidate.category === item.category);
                }

                return liveMatch
                    ? {
                        ...liveMatch,
                        quantity: item.quantity || 1,
                        justAdded: false
                    }
                    : {
                        ...item,
                        quantity: item.quantity || 1,
                        justAdded: false
                    };
            });
        },

        productMetadata(item) {
            if (item?.metadata && typeof item.metadata === 'object') {
                return item.metadata;
            }

            return {};
        },

        productRank(item) {
            const metadata = this.productMetadata(item);

            if (metadata.featured) return 3;
            if (metadata.bestseller) return 2;
            return 1;
        },

        sortFeaturedItems(items) {
            return [...items].sort((a, b) => {
                const rankDiff = this.productRank(b) - this.productRank(a);
                if (rankDiff !== 0) {
                    return rankDiff;
                }

                const inventoryDiff = (b.inventory || 0) - (a.inventory || 0);
                if (inventoryDiff !== 0) {
                    return inventoryDiff;
                }

                return a.name.localeCompare(b.name);
            });
        },

        filteredItems(category = this.activeCategory) {
            const query = this.searchQuery.trim().toLowerCase();
            const items = [...this.getItems(category)];

            const filtered = query
                ? items.filter(item => {
                    const haystack = `${item.name} ${item.desc || ''} ${category}`.toLowerCase();
                    return haystack.includes(query);
                })
                : items;

            if (this.sortOption === 'price-asc') {
                return filtered.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
            }

            if (this.sortOption === 'price-desc') {
                return filtered.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
            }

            if (this.sortOption === 'name') {
                return filtered.sort((a, b) => a.name.localeCompare(b.name));
            }

            return this.sortFeaturedItems(filtered);
        },

        getDefaultCategory() {
            const categories = this.getCategories();

            if (categories.includes('Candles') && this.getItems('Candles').length > 0) {
                return 'Candles';
            }

            const firstPopulated = categories.find(category => this.getItems(category).length > 0);
            if (firstPopulated) {
                return firstPopulated;
            }

            if (categories.includes('Candles')) {
                return 'Candles';
            }

            return categories[0] || 'Candles';
        },

        featuredItems(limit = 4) {
            return this.sortFeaturedItems(
                this.getCategories().flatMap(category => this.getItems(category))
            ).slice(0, limit);
        },

        categoryDescription(category) {
            const descriptions = {
                'Candles': 'Hand-poured soy candles made for cozy evenings, easy gifting, and everyday home fragrance.',
                'Wax Melts': 'Strong-scented wax melts that are quick to swap, easy to gift, and fun to collect.',
                '3D Prints': 'Custom and ready-made 3D printed pieces designed to be practical, playful, and personal.'
            };

            return descriptions[category] || `Browse the latest handmade items in ${category}.`;
        },

        productCategoryLabel(item) {
            if (item.category === '3dprints') return '3D Prints';
            if (item.category === 'waxmelts') return 'Wax Melts';
            if (item.category === 'candles') return 'Candles';

            return this.activeCategory || 'Collection';
        },

        inventoryLabel(item) {
            if ((item.inventory || 0) > 3) {
                return `${item.inventory} ready now`;
            }

            if ((item.inventory || 0) > 0) {
                return `Only ${item.inventory} left`;
            }

            return 'Made to order';
        },

        inventoryTone(item) {
            if ((item.inventory || 0) > 3) {
                return 'in-stock';
            }

            if ((item.inventory || 0) > 0) {
                return 'low-stock';
            }

            return 'made-order';
        },

        productHighlights(item) {
            const category = item.category || '';
            const highlights = {
                candles: ['Soy wax blend', 'Hand-poured in small batches', 'Great for gifting or home fragrance'],
                waxmelts: ['Strong scent throw', 'Easy to swap fragrances', 'Perfect for burners and warmers'],
                '3dprints': ['Designed and printed in-house', 'Fun, practical custom pieces', 'Ideal for gifts and desk setups']
            };

            return highlights[category] || ['Handmade item', 'Small-batch production', 'Available for local orders'];
        },

        productTags(item) {
            const category = item.category || '';
            const tags = {
                candles: ['Cozy scent', 'Gift-ready', 'Small batch'],
                waxmelts: ['Easy swap', 'Strong throw', 'Home fragrance'],
                '3dprints': ['Custom friendly', 'Made to order', 'Useful gift']
            };

            return tags[category] || ['Handmade', 'Small batch', 'Local order'];
        },

        productImage(item, size = 'card') {
            const fallbacks = {
                candles: 'images/icon-candle-new.png',
                waxmelts: 'images/icon-wax-new.png',
                '3dprints': 'images/icon-3d-new.png'
            };
            const images = Array.isArray(item.images) ? item.images : [];
            const primary = images[0];

            if (primary) {
                if (typeof primary === 'string') {
                    return primary;
                }

                if (size === 'thumb') {
                    return primary.thumb || primary.card || primary.url;
                }

                return primary.card || primary.url || primary.thumb;
            }

            return fallbacks[item.category] || fallbacks[this.activeCategory?.toLowerCase().replace(/\s+/g, '')] || fallbacks.candles;
        },

        getCategoryIcon(category) {
            const icons = {
                'Candles': 'local_fire_department',
                'Wax Melts': 'ac_unit',
                '3D Prints': 'view_in_ar'
            };
            return icons[category] || 'shopping_bag';
        },

        emptyCategoryMessage(category) {
            return `No products are live in ${category} yet. Add products in the admin area and they will appear here automatically.`;
        },

        pickupReadyText() {
            const hours = this.pickupReadyTimeHours;
            return `${hours} hour${hours === 1 ? '' : 's'}`;
        },

        deliveryOptionText() {
            if (this.deliveryFeeAmount <= 0) {
                return this.deliveryTimeText;
            }

            if (this.cartTotal >= this.freeShippingThreshold) {
                return `FREE on orders over ${this.formatPrice(this.freeShippingThreshold)}`;
            }

            return `${this.formatPrice(this.deliveryFeeAmount)} · ${this.deliveryTimeText}`;
        },

        orderTypeEstimate(orderType) {
            return orderType === 'pickup' ? this.pickupReadyText() : this.deliveryTimeText;
        },

        // Payment method helpers
        selectPaymentMethod(method) {
            this.checkoutData.paymentMethod = method;
        },

        selectDeliveryMethod(method) {
            this.orderType = method;
            if (method === 'pickup' && this.checkoutData.paymentMethod === 'pay_delivery') {
                this.checkoutData.paymentMethod = 'cash_pickup';
            }
            if (method === 'delivery' && this.checkoutData.paymentMethod === 'cash_pickup') {
                this.checkoutData.paymentMethod = 'pay_delivery';
            }
        }
    };
};


