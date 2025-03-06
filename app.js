import { createApp, ref, computed, watch, onMounted } from 'vue';

createApp({
    setup() {
        // State
        const currentView = ref('orders');
        const orders = ref([]);
        const parkingSpots = ref([]);
        const searchTerm = ref('');
        const statusFilter = ref('all');
        const showAddOrderModal = ref(false);
        const showParkingSpotModal = ref(false);
        const selectedSpot = ref({});
        const selectedOrderForSpot = ref(null);
        const newOrder = ref({
            customer: '',
            items: '',
            status: 'pending',
            time: ''
        });
        const settings = ref({
            notifications: {
                sound: true,
                desktop: false
            },
            parkingSpots: 12,
            display: {
                darkMode: false
            }
        });
        const toasts = ref([]);

        // Computed properties
        const filteredOrders = computed(() => {
            let filtered = orders.value;
            
            // Filter by status
            if (statusFilter.value !== 'all') {
                filtered = filtered.filter(order => order.status === statusFilter.value);
            }
            
            // Filter by search term
            if (searchTerm.value) {
                const term = searchTerm.value.toLowerCase();
                filtered = filtered.filter(order => 
                    order.customer.toLowerCase().includes(term) || 
                    order.id.toString().includes(term) ||
                    order.items.toLowerCase().includes(term)
                );
            }
            
            // Sort by time (newest first)
            return [...filtered].sort((a, b) => {
                return new Date(b.time) - new Date(a.time);
            });
        });

        const pendingOrders = computed(() => {
            return orders.value.filter(order => 
                (order.status === 'ready' || order.status === 'delivering') && 
                !order.parkingSpot
            );
        });

        // Methods
        function loadDemoData() {
            // Load sample orders
            orders.value = [
                { id: 1001, customer: 'John Smith', items: 'Milk, Bread, Eggs', status: 'completed', time: '2023-06-10T09:30:00', parkingSpot: null },
                { id: 1002, customer: 'Sarah Johnson', items: 'Apples, Bananas, Cereal', status: 'delivering', time: '2023-06-10T10:15:00', parkingSpot: 'A2' },
                { id: 1003, customer: 'Michael Brown', items: 'Chicken, Rice, Vegetables', status: 'ready', time: '2023-06-10T11:00:00', parkingSpot: null },
                { id: 1004, customer: 'Emily Davis', items: 'Ice Cream, Chocolate, Cookies', status: 'pending', time: '2023-06-10T11:45:00', parkingSpot: null }
            ];
            
            // Initialize parking spots
            regenerateParkingSpots();
            
            // Set the occupied spots
            parkingSpots.value.find(spot => spot.id === 'A2').orderId = 1002;
            
            // Load settings from local storage
            const savedSettings = localStorage.getItem('curbsideSettings');
            if (savedSettings) {
                settings.value = JSON.parse(savedSettings);
                regenerateParkingSpots();
            }
        }

        function regenerateParkingSpots() {
            parkingSpots.value = [];
            const rows = ['A', 'B', 'C', 'D'];
            const totalSpots = settings.value.parkingSpots;
            const spotsPerRow = Math.ceil(totalSpots / rows.length);
            
            let spotCount = 0;
            for (let r = 0; r < rows.length && spotCount < totalSpots; r++) {
                for (let i = 1; i <= spotsPerRow && spotCount < totalSpots; i++) {
                    parkingSpots.value.push({
                        id: `${rows[r]}${i}`,
                        orderId: null
                    });
                    spotCount++;
                }
            }
        }

        function addNewOrder() {
            const id = Math.max(0, ...orders.value.map(o => o.id)) + 1;
            const newOrderObj = {
                id,
                customer: newOrder.value.customer,
                items: newOrder.value.items,
                status: newOrder.value.status,
                time: new Date().toISOString(),
                parkingSpot: null
            };
            
            orders.value.push(newOrderObj);
            showAddOrderModal.value = false;
            newOrder.value = {
                customer: '',
                items: '',
                status: 'pending',
                time: ''
            };
            
            showToast('Order added successfully', 'success');
        }

        function getNextStatusLabel(status) {
            switch (status) {
                case 'pending': return 'Mark Ready';
                case 'ready': return 'Start Delivery';
                case 'delivering': return 'Complete';
                default: return 'Completed';
            }
        }

        function updateOrderStatus(id) {
            const order = orders.value.find(o => o.id === id);
            if (!order) return;
            
            switch (order.status) {
                case 'pending':
                    order.status = 'ready';
                    showToast('Order is now ready for pickup', 'info');
                    break;
                case 'ready':
                    order.status = 'delivering';
                    showToast('Order delivery in progress', 'info');
                    break;
                case 'delivering':
                    order.status = 'completed';
                    // Free up the parking spot
                    if (order.parkingSpot) {
                        const spot = parkingSpots.value.find(s => s.id === order.parkingSpot);
                        if (spot) spot.orderId = null;
                        order.parkingSpot = null;
                    }
                    showToast('Order completed successfully', 'success');
                    break;
            }
        }

        function completeOrder(id) {
            updateOrderStatus(id);
        }

        function assignParkingSpot(order) {
            selectedOrderForSpot.value = order.id;
            
            // Find available spots
            const availableSpots = parkingSpots.value.filter(spot => !spot.orderId);
            
            if (availableSpots.length > 0) {
                // Automatically assign to the first available spot
                const spot = availableSpots[0];
                spot.orderId = order.id;
                order.parkingSpot = spot.id;
                showToast(`Order assigned to parking spot ${spot.id}`, 'success');
            } else {
                showToast('No parking spots available', 'error');
            }
        }

        function handleParkingSpotClick(spot) {
            selectedSpot.value = spot;
            selectedOrderForSpot.value = null;
            showParkingSpotModal.value = true;
        }

        function assignSelectedOrderToSpot() {
            if (selectedOrderForSpot.value && selectedSpot.value) {
                const order = orders.value.find(o => o.id === selectedOrderForSpot.value);
                if (order) {
                    selectedSpot.value.orderId = order.id;
                    order.parkingSpot = selectedSpot.value.id;
                    showToast(`Order #${order.id} assigned to spot ${selectedSpot.value.id}`, 'success');
                    showParkingSpotModal.value = false;
                }
            }
        }

        function freeSpot(spotId) {
            const spot = parkingSpots.value.find(s => s.id === spotId);
            if (spot && spot.orderId) {
                const order = orders.value.find(o => o.id === spot.orderId);
                if (order) {
                    order.parkingSpot = null;
                }
                spot.orderId = null;
                showToast(`Parking spot ${spotId} is now available`, 'info');
                showParkingSpotModal.value = false;
            }
        }

        function getOrderById(id) {
            return orders.value.find(o => o.id === id) || { customer: 'Unknown' };
        }

        function saveSettings() {
            localStorage.setItem('curbsideSettings', JSON.stringify(settings.value));
            showToast('Settings saved successfully', 'success');
        }

        function showToast(message, type = 'info') {
            const toast = { message, type };
            toasts.value.push(toast);
            
            // Remove toast after 3 seconds
            setTimeout(() => {
                const index = toasts.value.indexOf(toast);
                if (index > -1) {
                    toasts.value.splice(index, 1);
                }
            }, 3000);
            
            // Play sound if enabled
            if (settings.value.notifications.sound) {
                playNotificationSound(type);
            }
            
            // Show desktop notification if enabled
            if (settings.value.notifications.desktop && 'Notification' in window) {
                if (Notification.permission === 'granted') {
                    new Notification('Curbside Helper', { body: message });
                } else if (Notification.permission !== 'denied') {
                    Notification.requestPermission();
                }
            }
        }

        function playNotificationSound(type) {
            // Create a simple beep sound using the Web Audio API
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // Different sounds for different notification types
            switch (type) {
                case 'success':
                    oscillator.frequency.value = 800;
                    gainNode.gain.value = 0.1;
                    oscillator.start();
                    setTimeout(() => oscillator.stop(), 200);
                    break;
                case 'error':
                    oscillator.frequency.value = 300;
                    gainNode.gain.value = 0.1;
                    oscillator.start();
                    setTimeout(() => oscillator.stop(), 400);
                    break;
                default:
                    oscillator.frequency.value = 600;
                    gainNode.gain.value = 0.1;
                    oscillator.start();
                    setTimeout(() => oscillator.stop(), 200);
            }
        }

        // Lifecycle hooks
        onMounted(() => {
            loadDemoData();
            
            // Apply dark mode if set
            if (settings.value.display.darkMode) {
                document.body.classList.add('dark-mode');
            }
            
            // Request permission for notifications
            if ('Notification' in window && settings.value.notifications.desktop) {
                Notification.requestPermission();
            }
        });
        
        // Watch for dark mode changes
        watch(() => settings.value.display.darkMode, (newVal) => {
            if (newVal) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
        });

        return {
            // State
            currentView,
            orders,
            parkingSpots,
            searchTerm,
            statusFilter,
            showAddOrderModal,
            showParkingSpotModal,
            selectedSpot,
            selectedOrderForSpot,
            newOrder,
            settings,
            toasts,
            
            // Computed
            filteredOrders,
            pendingOrders,
            
            // Methods
            addNewOrder,
            getNextStatusLabel,
            updateOrderStatus,
            completeOrder,
            assignParkingSpot,
            handleParkingSpotClick,
            assignSelectedOrderToSpot,
            freeSpot,
            getOrderById,
            saveSettings,
            regenerateParkingSpots,
            showToast
        };
    }
}).mount('#app');

