// scripts/modules/payment-integration.js
// BRIDGE ANTARA POS DENGAN MODUL QRIS

const PaymentIntegration = {
    isInitialized: false,

    // ⭐ INITIALIZE MODULE
    init() {
        if (this.isInitialized) return;
        
        // Initialize QRIS module dengan callback
        QRISDinamis.init({
            onPaymentSuccess: (paymentData) => {
                console.log('💰 Payment successful via module:', paymentData);
                this.handlePaymentSuccess(paymentData);
            },
            onStatusUpdate: (statusData) => {
                this.updateStatusDisplay(statusData);
            },
            onError: (errorMessage) => {
                console.error('❌ QRIS Module error:', errorMessage);
                this.showError(errorMessage);
            }
        });
        
        this.isInitialized = true;
        console.log('✅ Payment Integration initialized');
    },

    // ⭐ HANDLE QRIS PAYMENT
    async handleQRISPayment(amount) {
        try {
            // Tampilkan loading state
            this.showLoadingState();
            
            // Generate QRIS
            const result = await QRISDinamis.generate(amount);
            
            if (result.success) {
                return {
                    success: true,
                    qrImageUrl: result.qrImageUrl,
                    referenceId: result.referenceId,
                    html: this.getQRISDisplayHTML(result.qrImageUrl, result.referenceId)
                };
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('❌ QRIS Payment error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // ⭐ START PAYMENT MONITORING
    startMonitoring(referenceId) {
        QRISDinamis.startPolling(referenceId);
    },

    // ⭐ STOP PAYMENT MONITORING
    stopMonitoring() {
        QRISDinamis.stopPolling();
    },

    // ⭐ SHOW LOADING STATE
    showLoadingState() {
        // Loading state akan dihandle oleh POS UI
        console.log('🔄 Showing loading state...');
    },

    // ⭐ UPDATE STATUS DISPLAY
    updateStatusDisplay(statusData) {
        const statusDisplay = document.getElementById('qrisStatusDisplay');
        if (statusDisplay) {
            statusDisplay.innerHTML = QRISDinamis.getStatusDisplayHTML(statusData);
        }
    },

    // ⭐ HANDLE PAYMENT SUCCESS
    handlePaymentSuccess(paymentData) {
        // Trigger success celebration
        this.showSuccessCelebration(paymentData);
        
        // Notify POS system untuk proses order
        if (window.POSModule && window.PaymentModule) {
            setTimeout(() => {
                window.PaymentModule.confirmPayment();
            }, 2000);
        }
    },

    // ⭐ SHOW SUCCESS CELEBRATION
    showSuccessCelebration(paymentData) {
        const statusDisplay = document.getElementById('qrisStatusDisplay');
        if (statusDisplay) {
            statusDisplay.innerHTML += `
                <div class="mt-3 p-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg text-center animate-pulse">
                    <p class="font-bold">🎉 PEMBAYARAN BERHASIL!</p>
                    <p class="text-sm">Transaksi akan diproses otomatis</p>
                </div>
            `;
        }
    },

    // ⭐ SHOW ERROR
    showError(errorMessage) {
        const container = document.getElementById('qrisImageContainer');
        if (container) {
            container.innerHTML = `
                <div class="text-red-600 text-center p-4 bg-red-50 rounded-lg border border-red-200">
                    <p class="font-semibold">❌ Gagal Generate QRIS</p>
                    <p class="text-sm mt-1">${errorMessage}</p>
                    <button onclick="PaymentIntegration.retryQRIS()" 
                            class="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition">
                        🔄 Coba Lagi
                    </button>
                </div>
            `;
        }
    },

    // ⭐ RETRY QRIS GENERATION
    async retryQRIS() {
        if (window.PaymentModule && window.PaymentModule.currentOrderSummary) {
            const amount = window.PaymentModule.currentOrderSummary.total;
            await window.PaymentModule.showQRISDinamisModal();
        }
    },

    // ⭐ GET QRIS DISPLAY HTML
    getQRISDisplayHTML(qrImageUrl, referenceId) {
        return `
            <img src="${qrImageUrl}" 
                 alt="QRIS Code" 
                 class="mx-auto border-2 border-gray-300 p-4 rounded-lg bg-white max-w-full">
            <p class="text-xs text-gray-500 mt-2 text-center">Scan QR code dengan aplikasi e-wallet atau bank</p>
            
            <div id="qrisStatusDisplay" class="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div class="flex items-center justify-center gap-2 mb-2">
                    <div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <span class="text-blue-700 font-semibold">Menunggu Pembayaran</span>
                </div>
                <div class="text-center">
                    <p class="text-xs text-blue-600">Reference: <code class="bg-blue-100 px-1 rounded">${referenceId}</code></p>
                    <p class="text-xs text-blue-600 mt-1">Monitoring aktif - auto update setiap 3 detik</p>
                </div>
            </div>
        `;
    },

    // ⭐ CLEANUP
    cleanup() {
        this.stopMonitoring();
        QRISDinamis.cleanup();
        this.isInitialized = false;
    }
};

// Export untuk penggunaan global
window.PaymentIntegration = PaymentIntegration;

// Auto-init ketika file loaded
document.addEventListener('DOMContentLoaded', function() {
    PaymentIntegration.init();
});