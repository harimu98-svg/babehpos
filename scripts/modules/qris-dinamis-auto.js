// scripts/modules/qris-dinamis-auto.js
// MODUL QRIS DINAMIS - VERSION BARU DENGAN MANUAL CONFIRM

const QRISDinamis = {
    currentReferenceId: null,
    pollingInterval: null,

    init() {
        console.log('🚀 QRISDinamis Module initialized');
    },

    async generate(amount) {
        console.log('🚀 Generating QRIS for amount:', amount);
        
        try {
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
                    rawData: data,
                    html: this.getQRISDisplayHTML(qrImageUrl, this.currentReferenceId)
                };
                
            } else {
               // ⭐ UPDATE INI - LANGSUNG RETURN ERROR INFO
                console.log('❌ iPaymu returned error:', data.Message);
                return {
                    success: false,
                    error: this.getUserFriendlyError(data.Message),
                    showToUser: true
                };
            }
        } catch (error) {
            console.error('❌ QRIS Generation Error:', error);
            return {
                success: false,
                error: this.getUserFriendlyError(error.message),
                showToUser: true
            };
        }
    },
// ⭐ TAMBAHKAN FUNCTION INI DI DALAM QRISDinamis object
    getUserFriendlyError(technicalError) {
        const errorMsg = technicalError.toLowerCase();
        
        if (errorMsg.includes('failed to generate qris')) {
            return '⚠️ Payment gateway sedang sibuk. Silakan coba lagi dalam beberapa saat.';
        } else if (errorMsg.includes('timeout')) {
            return '⏱️ Koneksi timeout. Pastikan internet stabil dan coba lagi.';
        } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
            return '📡 Gangguan koneksi. Periksa internet Anda.';
        } else if (errorMsg.includes('balance') || errorMsg.includes('saldo')) {
            return '💳 Saldo payment gateway tidak mencukupi.';
        } else {
            return '❌ Gagal generate QRIS. Silakan coba metode pembayaran lain.';
        }
    },
    startPolling(referenceId = null) {
        this.stopPolling();
        
        const refId = referenceId || this.currentReferenceId;
        if (!refId) {
            console.error('❌ No reference ID for polling');
            return;
        }

        console.log('🔍 Polling started for:', refId);
        
        // Immediate first check
        this.checkPaymentStatus(refId);
        
        // Poll every 3 seconds
        this.pollingInterval = setInterval(() => {
            this.checkPaymentStatus(refId);
        }, 3000);
    },

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log('🛑 Polling stopped');
        }
    },

    async checkPaymentStatus(referenceId) {
        try {
            console.log('🔍 Checking payment status for:', referenceId);
            
            const res = await fetch('/.netlify/functions/callback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    referenceId: referenceId,
                    action: 'checkStatus'
                }),
            });
            
            if (!res.ok) {
                console.log('❌ Polling request failed:', res.status);
                return;
            }
            
            const data = await res.json();
            console.log('📊 Polling response:', data);
            
            // Update last check time
            const lastCheckElement = document.getElementById('lastCheck');
            if (lastCheckElement) {
                lastCheckElement.textContent = new Date().toLocaleTimeString();
            }
            
            if (data.exists && data.status) {
                console.log('✅ Status found:', data.status);
                
                this.updateStatusDisplay(data);
                
                if (data.status === 'berhasil' || data.status === 'expired') {
                    this.stopPolling();
                    
                    if (data.status === 'berhasil') {
                        console.log('💰 PAYMENT SUCCESS - Show confirm button');
                        this.showSuccessUI(data);
                    }
                    
                    if (data.status === 'expired') {
                        setTimeout(() => {
                            this.closeQRISModal();
                        }, 3000);
                    }
                }
            } else {
                console.log('⏳ No status yet, continue polling...');
            }
            
        } catch (error) {
            console.log('❌ Polling check error:', error.message);
        }
    },

    showSuccessUI(paymentData) {
        console.log('🎨 Showing Success UI');
        
        const statusDisplay = document.getElementById('qrisStatusDisplay');
        if (statusDisplay) {
            statusDisplay.innerHTML = `
                <div class="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                    <div class="text-center">
                        <span class="text-green-700 font-semibold">✅ Pembayaran Berhasil!</span>
                        <p class="text-xs text-green-600 mt-1">Klik tombol below untuk selesaikan transaksi:</p>
                        
                        <!-- TOMBOL CONFIRM & PRINT -->
                        <div class="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <button onclick="QRISDinamis.processSuccessfulPayment('${paymentData.reference_id}', ${paymentData.amount})" 
                                    class="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold text-sm hover:bg-blue-700">
                                ✅ PROSES TRANSAKSI & PRINT RECEIPT
                            </button>
                            <p class="text-xs text-blue-500 mt-2">
                                Transaksi akan disimpan dan receipt akan diprint
                            </p>
                        </div>
                    </div>
                </div>
            `;
        }
    },

    async processSuccessfulPayment(referenceId, amount) {
        console.log('🔄 Processing successful QRIS payment:', referenceId);
        
        try {
            showLoading(true);
            
            // ⭐ SET STATE PaymentModule 
            if (!window.PaymentModule) {
                throw new Error('PaymentModule tidak ditemukan');
            }
            
            window.PaymentModule.currentPaymentType = 'qris_dinamis';
            window.PaymentModule.currentIpaymuReferenceId = referenceId;
            
            // ⭐ PASTIKAN ORDER SUMMARY ADA
            if (!window.PaymentModule.currentOrderSummary) {
                window.PaymentModule.currentOrderSummary = window.POSModule.getOrderSummary();
            }
            
            console.log('🔧 PaymentModule state set for QRIS:', {
                paymentType: window.PaymentModule.currentPaymentType,
                referenceId: window.PaymentModule.currentIpaymuReferenceId,
                amount: amount
            });
            
            // ⭐ TUTUP QRIS MODAL
            this.closeQRISModal();
            
            // ⭐ PANGGIL confirmPayment() - SAMA PERSIS DENGAN CASH
            await window.PaymentModule.confirmPayment();
            
            console.log('✅ QRIS payment processed successfully');
            
        } catch (error) {
            console.error('❌ Error processing QRIS payment:', error);
            showNotification('Gagal memproses pembayaran: ' + error.message, 'error');
            
            // ⭐ TAMPILKAN TOMBOL RETRY JIKA GAGAL
            this.showRetryButton(referenceId, amount);
        } finally {
            showLoading(false);
        }
    },

    showRetryButton(referenceId, amount) {
        const statusDisplay = document.getElementById('qrisStatusDisplay');
        if (statusDisplay) {
            statusDisplay.innerHTML += `
                <div class="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                    <p class="text-xs text-red-600 mb-2">
                        Gagal memproses transaksi. Coba lagi:
                    </p>
                    <button onclick="QRISDinamis.processSuccessfulPayment('${referenceId}', ${amount})" 
                            class="w-full bg-red-600 text-white py-2 px-4 rounded-lg font-semibold text-sm hover:bg-red-700">
                        🔄 COBA LAGI
                    </button>
                </div>
            `;
        }
    },

    updateStatusDisplay(statusData) {
        const statusDisplay = document.getElementById('qrisStatusDisplay');
        if (!statusDisplay) return;
        
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
                bgColor: 'bg-orange-50', 
                borderColor: 'border-orange-200', 
                textColor: 'text-orange-700', 
                icon: '⏰', 
                message: 'QRIS Kadaluarsa',
                showLoading: false 
            }
        };
        
        const config = statusConfig[status] || statusConfig.pending;
        
        statusDisplay.innerHTML = `
            <div class="mt-4 p-3 ${config.bgColor} rounded-lg border ${config.borderColor}">
                <div class="flex items-center justify-center gap-2 mb-2">
                    ${config.showLoading ? '<div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>' : ''}
                    <span class="${config.textColor} font-semibold">${config.icon} ${config.message}</span>
                </div>
                <div class="text-center">
                    <p class="text-xs ${config.textColor}">Reference: ${statusData.reference_id}</p>
                    ${statusData.amount ? `<p class="text-xs ${config.textColor} mt-1">Amount: Rp ${parseInt(statusData.amount).toLocaleString()}</p>` : ''}
                    ${status === 'pending' ? `<p class="text-xs ${config.textColor} mt-1">Auto update setiap 3 detik</p>` : ''}
                </div>
            </div>
        `;
    },

    getQRISDisplayHTML(qrImageUrl, referenceId) {
        return `
            <div class="text-center">
                <img src="${qrImageUrl}" alt="QRIS Code" class="mx-auto border-2 border-gray-300 p-4 rounded-lg bg-white max-w-full">
                <p class="text-xs text-gray-500 mt-2">Scan QR code dengan aplikasi e-wallet atau bank</p>
                
                <div class="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-center">
                    <p class="text-xs font-semibold text-yellow-700">Reference: ${referenceId}</p>
                </div>
                
                <div id="qrisStatusDisplay" class="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div class="flex items-center justify-center gap-2 mb-2">
                        <div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <span class="text-blue-700 font-semibold">Menunggu Pembayaran</span>
                    </div>
                    <div class="text-center">
                        <p class="text-xs text-blue-600">Reference: ${referenceId}</p>
                        <p class="text-xs text-blue-600 mt-1">Auto update setiap 3 detik</p>
                        <p class="text-xs text-blue-600 mt-1" id="lastCheck">${new Date().toLocaleTimeString()}</p>
                    </div>
                </div>
            </div>
        `;
    },

    closeQRISModal() {
        console.log('🚪 Closing QRIS Modal...');
        const modal = document.getElementById('qrisDisplayModal');
        if (modal) modal.classList.add('hidden');
        this.stopPolling();
        this.currentReferenceId = null;
    },

    cleanup() {
        this.stopPolling();
        this.currentReferenceId = null;
    }
};

// Export untuk penggunaan global
window.QRISDinamis = QRISDinamis;

// Auto-initialize
document.addEventListener('DOMContentLoaded', function() {
    QRISDinamis.init();
    console.log('✅ QRIS Dinamis Module loaded and ready');
});

// Auto-cleanup
window.addEventListener('beforeunload', () => QRISDinamis.cleanup());
window.addEventListener('pagehide', () => QRISDinamis.cleanup());
