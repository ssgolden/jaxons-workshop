window.staffBoard = function() {
    return {
        isLoggedIn: false,
        pin: '',
        pinError: '',
        orders: [],
        history: [],
        activeTab: 'active',
        todayOrders: [],
        todayRevenue: 0,
        completedToday: 0,
        pendingToday: 0,
        socket: null,
        audio: null,
        activeStatuses: ['new', 'confirmed', 'processing', 'ready'],

        async init() {
            this.audio = document.getElementById('notifySound');
            try {
                const res = await this.staffFetch('/api/admin/me');
                if (res.ok) {
                    this.isLoggedIn = true;
                    this.connectSocket();
                    this.loadOrders();
                    this.loadStats();
                }
            } catch (e) {}
        },

        async staffFetch(url, options = {}) {
            return fetch(url, {
                credentials: 'same-origin',
                ...options,
                headers: {
                    ...(options.headers || {})
                }
            });
        },

        async login() {
            try {
                const res = await this.staffFetch('/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pin: this.pin })
                });

                if (!res.ok) {
                    this.pinError = 'Incorrect PIN.';
                    this.pin = '';
                    return;
                }

                this.isLoggedIn = true;
                this.pinError = '';
                this.connectSocket();
                this.loadOrders();
                this.loadStats();
            } catch (e) {
                this.pinError = 'Login failed.';
                this.pin = '';
            }
        },

        async logout() {
            await this.staffFetch('/api/admin/logout', { method: 'POST' });
            this.isLoggedIn = false;
            this.pin = '';
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }
        },

        connectSocket() {
            this.socket = io();

            this.socket.on('connect', () => {
                this.socket.emit('join:admin');
                console.log('Connected to server');
            });

            this.socket.on('order:new', () => {
                this.loadOrders();
                this.playNotify();
                if (navigator.vibrate) navigator.vibrate(200);
                this.loadStats();
            });

            this.socket.on('order:updated', () => {
                this.loadOrders();
                this.loadHistory();
                this.loadStats();
            });
        },

        async loadOrders() {
            try {
                const res = await this.staffFetch('/api/admin/orders');
                if (!res.ok) throw new Error('Failed to load orders');
                const data = await res.json();
                this.orders = (data.orders || []).filter(order => this.activeStatuses.includes(order.status));
            } catch (e) {
                console.error('Failed to load orders', e);
            }
        },

        async loadHistory() {
            try {
                const res = await this.staffFetch('/api/admin/orders');
                if (!res.ok) throw new Error('Failed to load history');
                const data = await res.json();
                this.history = (data.orders || []).filter(order => ['fulfilled', 'completed', 'cancelled'].includes(order.status));
            } catch (e) {
                console.error('Failed to load history', e);
            }
        },

        async loadStats() {
            try {
                const res = await this.staffFetch('/api/admin/orders');
                if (!res.ok) throw new Error('Failed to load stats');
                const data = await res.json();
                const all = data.orders || [];
                const today = new Date().toDateString();
                this.todayOrders = all.filter(o => new Date(o.created_at).toDateString() === today);
                this.todayRevenue = this.todayOrders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
                this.completedToday = this.todayOrders.filter(o => o.status === 'completed').length;
                this.pendingToday = this.todayOrders.filter(o => this.activeStatuses.includes(o.status)).length;
            } catch (e) {
                console.error('Failed to load stats', e);
            }
        },

        async updateStatus(orderId, status) {
            try {
                await this.staffFetch(`/api/admin/orders/${orderId}/status`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status })
                });
                this.loadOrders();
                this.loadHistory();
                this.loadStats();
            } catch (e) {
                console.error('Failed to update status', e);
            }
        },

        minsAgo(dateStr) {
            const then = new Date(dateStr);
            const now = new Date();
            return Math.floor((now - then) / 60000);
        },

        timeAgo(dateStr) {
            const mins = this.minsAgo(dateStr);
            if (mins < 1) return 'Just now';
            if (mins < 60) return mins + 'm ago';
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return hrs + 'h ago';
            return new Date(dateStr).toLocaleDateString();
        },

        playNotify() {
            try {
                if (this.audio) {
                    this.audio.currentTime = 0;
                    this.audio.play().catch(() => {});
                }
            } catch (e) {}
        }
    };
};
