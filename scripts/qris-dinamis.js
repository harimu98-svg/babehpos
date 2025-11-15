// scripts/modules/qris-dinamis.js
// MODUL QRIS DINAMIS STANDALONE

const QRISDinamis = {
    currentReferenceId: null,
    pollingInterval: null,
    onPaymentSuccess: null,
    onStatusUpdate: null,
    onError: null,

    // ⭐ INIT MODULE
    init(callbacks = {}) {
        this.onPaymentSuccess = callbacks.onPaymentSuccess || null;
        this.onStatusUpdate = callbacks.onStatusUpdate || null;
        this.onError = callbacks.onError || null;
        console.log('✅ QRIS Module initialized');
    },

    // ⭐ GENERATE QRIS
    async generate(amount) {
        try {
            console.log('🚀 Generating QRIS for amount:', amount);
            
            const response = await fetch('/.netlify/functions/createPayment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('📊 iPaymu Response:', data);
            
            if ((data.Status === 200 || data.Status === 0) && data.Data?.QrString) {
                this.currentReferenceId = data.Data.ReferenceId || data.Data.SessionId;
                
                const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data.Data.QrString)}`;
                
                return {
                    success: true,
                    qrImageUrl: qrImageUrl,
                    referenceId: this.currentReferenceId,
                    rawData: data
                };
            } else {
                throw new Error(data.Message || 'Gagal generate QRIS');
            }
        } catch (error) {
            console.error('❌ QRIS Generation Error:', error);
            
            if (this.onError) {
                this.onError(error.message);
            }
            
            return {
                success: false,
                error: error.message
            };
        }
    },

    // ⭐ START POLLING
    startPolling(referenceId = null) {
        this.stopPolling();
        
        const refId = referenceId || this.currentReferenceId;
        if (!refId) {
            console.error('❌ No reference ID for polling');
            return;
        }

        // Immediate first check
        this.checkPaymentStatus(refId);
        
        // Poll every 3 seconds
        this.pollingInterval = setInterval(() => {
            this.checkPaymentStatus(refId);
        }, 3000);
        
        console.log('🔍 Polling started for:', refId);
    },

    // ⭐ STOP POLLING
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log('🛑 Polling stopped');
        }
    },

    // ⭐ CHECK PAYMENT STATUS
    async checkPaymentStatus(referenceId) {
        try {
            const res = await fetch('/.netlify/functions/callback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    referenceId: referenceId,
                    action: 'checkStatus'
                }),
            });
            
            if (!res.ok) return;
            
            const data = await res.json();
            
            if (data.exists && data.status) {
                // Notify status update
                if (this.onStatusUpdate) {
                    this.onStatusUpdate(data);
                }
                
                // Handle successful payment
                if (data.status === 'berhasil' && this.onPaymentSuccess) {
                    this.stopPolling();
                    this.onPaymentSuccess(data);
                }
                
                // Handle expired
                if (data.status === 'expired') {
                    this.stopPolling();
                }
            }
        } catch (error) {
            console.log('Polling check error:', error.message);
        }
    },

    // ⭐ GET STATUS DISPLAY HTML
    getStatusDisplayHTML(statusData) {
        const status = statusData.status || 'pending';
        
        const statusConfig = {
            'pending': {
                bgColor: 'bg-blue-50',
                borderColor: 'border-blue-200',
                textColor: 'text-blue-700',
                icon: '⏳',
                message: 'Menunggu Pembayaran',
                showLoading: true
            },
            'berhasil': {
                bgColor: 'bg-green-50',
                borderColor: 'border-green-200',
                textColor: 'text-green-700',
                icon: '✅',
                message: 'Pembayaran Berhasil!',
                showLoading: false
            },
            'expired': {
                bgColor: 'bg-red-50',
                borderColor: 'border-red-200',
                textColor: 'text-red-700',
                icon: '❌',
                message: 'Pembayaran Kadaluarsa',
                showLoading: false
            }
        };
        
        const config = statusConfig[status] || statusConfig.pending;
        
        return `
            <div class="mt-4 p-3 ${config.bgColor} rounded-lg border ${config.borderColor}">
                <div class="flex items-center justify-center gap-2 mb-2">
                    ${config.showLoading ? '<div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>' : ''}
                    <span class="${config.textColor} font-semibold">${config.icon} ${config.message}</span>
                </div>
                <div class="text-center">
                    <p class="text-xs ${config.textColor}">Reference: <code class="bg-white bg-opacity-50 px-1 rounded">${statusData.reference_id}</code></p>
                    ${statusData.amount ? `<p class="text-xs ${config.textColor} mt-1">Amount: Rp ${parseInt(statusData.amount).toLocaleString()}</p>` : ''}
                    ${statusData.paid_at ? `<p class="text-xs ${config.textColor} mt-1">Paid at: ${new Date(statusData.paid_at).toLocaleString('id-ID')}</p>` : ''}
                    ${status === 'pending' ? `<p class="text-xs ${config.textColor} mt-1">Auto update setiap 3 detik</p>` : ''}
                </div>
            </div>
        `;
    },

    // ⭐ CLEANUP
    cleanup() {
        this.stopPolling();
        this.currentReferenceId = null;
        this.onPaymentSuccess = null;
        this.onStatusUpdate = null;
        this.onError = null;
    }
};

// Export untuk penggunaan global
window.QRISDinamis = QRISDinamis;