// scripts/modules/payment-integration-simple.js
// BRIDGE SIMPLE UNTUK QRIS DINAMIS

const PaymentIntegration = {
    isInitialized: false,

    // ⭐ INITIALIZE MODULE
    init() {
        if (this.isInitialized) return;
        
        console.log('🚀 Payment Integration Simple initialized');
        
        // Initialize QRIS module
        if (window.QRISDinamis) {
            QRISDinamis.init();
            console.log('✅ QRISDinamis initialized');
        }
        
        this.isInitialized = true;
    },

    // ⭐ HANDLE QRIS PAYMENT
    async handleQRISPayment(amount) {
        console.log('💰 Processing QRIS payment:', amount);
        
        try {
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

    // ⭐ GET QRIS DISPLAY HTML
    getQRISDisplayHTML(qrImageUrl, referenceId) {
        return QRISDinamis.getQRISDisplayHTML(qrImageUrl, referenceId);
    },

    // ⭐ CLEANUP
    cleanup() {
        this.stopMonitoring();
        if (window.QRISDinamis) {
            QRISDinamis.cleanup();
        }
        this.isInitialized = false;
    }
};

// Export untuk penggunaan global
window.PaymentIntegration = PaymentIntegration;

// Auto-init ketika file loaded
document.addEventListener('DOMContentLoaded', function() {
    PaymentIntegration.init();
});
