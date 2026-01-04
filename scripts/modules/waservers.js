// scripts/modules/waservers.js
// =============================================
// WHATSAPP SERVER NOTIFICATION MODULE
// =============================================

const WAServerNotification = {
    
    // =============================================
    // MAIN FUNCTION: SEND WA TO SERVER
    // =============================================
    async sendToServer(orderData) {
        try {
            console.group('📤 SENDING WA TO SERVER');
            
            // 1. DAPATKAN OUTLET DARI USER
            const user = Auth.getCurrentUser();
            const outlet = user?.outlet;
            
            if (!outlet) {
                console.warn('❌ Cannot proceed: No outlet information');
                console.groupEnd();
                return false;
            }
            
            console.log(`🏪 Outlet: ${outlet}`);
            
            // 2. CEK KONFIGURASI OUTLET
            console.log('🔧 Checking outlet WA notification setting...');
            const shouldSend = await this.checkOutletWANotification(outlet);
            
            if (!shouldSend) {
                console.log(`🔕 WA notification DISABLED for outlet ${outlet}`);
                console.groupEnd();
                return false;
            }
            
            console.log(`✅ WA notification ENABLED for outlet ${outlet}`);
            
            // 3. VALIDASI DATA
            const { orderNo, totalAmount, items, servedBy, paymentType, 
                    kasir, orderDate, orderTime, subtotal, 
                    discountAmount, redeemAmount, cashReceived, cashChange } = orderData;
            
            if (!servedBy) {
                console.warn('⚠️ No server specified, skipping server notification');
                console.groupEnd();
                return false;
            }
            
            console.log(`👨‍💼 Server: ${servedBy}`);
            
            // 4. AMBIL NOMOR WA SERVER
            console.log(`🔍 Getting WA number for server...`);
            const serverWA = await this.getServerWANumber(servedBy);
            
            if (!serverWA) {
                console.warn(`⚠️ No WA number found for server ${servedBy}`);
                console.groupEnd();
                return false;
            }
            
            console.log(`📞 Server WA: ${serverWA}`);
            
            // 5. HITUNG TOTAL KOMISI
            const totalKomisi = items.reduce((sum, item) => sum + (item.komisi || 0) * item.quantity, 0);
            console.log(`💰 Total Komisi: Rp ${this.formatCurrency(totalKomisi)}`);
            
            // 6. BUAT PESAN
            const message = this.createServerNotification(
                orderNo, totalAmount, items, servedBy, paymentType, 
                kasir, orderDate, orderTime, totalKomisi, subtotal,
                discountAmount, redeemAmount, cashReceived, cashChange
            );
            
            console.log(`📝 Message prepared (${message.length} chars)`);
            
            // 7. KIRIM WA
            console.log(`📤 Sending WA to server...`);
            const success = await this.sendWA(serverWA, message, 'server');
            
            if (success) {
                console.log(`✅ WA successfully sent to server ${servedBy}`);
            } else {
                console.warn(`⚠️ Failed to send WA to server`);
            }
            
            console.groupEnd();
            return success;
            
        } catch (error) {
            console.error('❌ Error in sendToServer:', error);
            console.groupEnd();
            return false;
        }
    },
    
    // =============================================
    // CHECK OUTLET WA NOTIFICATION CONFIG
    // =============================================
    async checkOutletWANotification(outletName) {
        try {
            console.log(`🔧 Checking WA notification for outlet: ${outletName}`);
            
            const { data, error } = await supabase
                .from('outlet')
                .select('wa_notification')
                .eq('outlet', outletName)
                .single();
            
            if (error) {
                console.warn(`⚠️ Error checking outlet config:`, error.message);
                return true; // Default true jika error
            }
            
            if (!data) {
                console.log(`ℹ️ No outlet config found for ${outletName}, using default: true`);
                return true;
            }
            
            const shouldSend = data.wa_notification === true;
            console.log(`✅ WA notification config: ${shouldSend}`);
            
            return shouldSend;
            
        } catch (error) {
            console.error('Error checking outlet config:', error);
            return true;
        }
    },
    
    // =============================================
    // GET SERVER WA NUMBER FROM KARYAWAN TABLE
    // =============================================
    async getServerWANumber(serverName) {
        try {
            if (!serverName) {
                console.warn('❌ No server name provided');
                return null;
            }
            
            console.log(`🔍 Getting WA number for server: ${serverName}`);
            
            const { data, error } = await supabase
                .from('karyawan')
                .select('nomor_wa')
                .eq('nama_karyawan', serverName)
                .single();
            
            if (error) {
                console.warn(`⚠️ Database error for server ${serverName}:`, error.message);
                return null;
            }
            
            if (!data?.nomor_wa) {
                console.log(`ℹ️ No WA number found for server ${serverName}`);
                return null;
            }
            
            const formattedWA = this.formatWA(data.nomor_wa);
            console.log(`✅ Found WA for server ${serverName}: ${formattedWA}`);
            
            return formattedWA;
            
        } catch (error) {
            console.error('Error getting server WA:', error);
            return null;
        }
    },
    
    // =============================================
    // CREATE SERVER NOTIFICATION MESSAGE WITH KOMISI
    // =============================================
    createServerNotification(orderNo, totalAmount, items, servedBy, paymentType, 
        kasir, orderDate, orderTime, totalKomisi, subtotal, discountAmount, 
        redeemAmount, cashReceived, cashChange) {
        
        const formatCurrency = this.formatCurrency;
        
        // Format items dengan komisi per item
        const itemsText = items.map((item, index) => {
            const itemTotal = item.harga_jual * item.quantity;
            const itemKomisi = item.komisi ? ` (Komisi: Rp ${formatCurrency(item.komisi)}/pcs)` : '';
            return `${index + 1}. ${item.nama_produk} ${item.quantity}x @Rp ${formatCurrency(item.harga_jual)} = Rp ${formatCurrency(itemTotal)}${itemKomisi}`;
        }).join('\n');
        
        const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
        
        let message = `💼 *NOTIFIKASI TRANSAKSI #${orderNo}*\n`;
        message += `═════════════════════════\n`;
        message += `👤 *Kasir:* ${kasir}\n`;
        message += `👨‍💼 *Server:* ${servedBy}\n`;
        message += `📅 ${orderDate} ${orderTime}\n`;
        message += `═════════════════════════\n\n`;
        
        message += `🛒 *ITEM (${totalQty}):*\n`;
        message += `${itemsText}\n\n`;
        
        message += `💰 *RINGKASAN PEMBAYARAN:*\n`;
        message += `Subtotal: Rp ${formatCurrency(subtotal)}\n`;
        
        if (discountAmount > 0) {
            message += `Diskon: -Rp ${formatCurrency(discountAmount)}\n`;
        }
        
        if (redeemAmount > 0) {
            message += `Redeem: -Rp ${formatCurrency(redeemAmount)}\n`;
        }
        
        message += `💳 *Payment:* ${paymentType.toUpperCase()}\n`;
        message += `*Total:* Rp ${formatCurrency(totalAmount)}\n\n`;
        
        // ✅ TAMBAH INFORMASI KOMISI
        message += `🎯 *INFO KOMISI:*\n`;
        message += `💵 Total Komisi: Rp ${formatCurrency(totalKomisi)}\n\n`;
                    
        message += `✅ *Transaksi berhasil!*\n`;
        message += `💪 Terima kasih telah melayani dengan baik!\n\n`;
        message += `*BABEH BARBERSHOP*`;
        
        return message;
    },
    
    // =============================================
    // HELPER FUNCTIONS
    // =============================================
    
    // Format nomor WA
    formatWA(phone) {
        if (!phone) return null;
        
        if (phone.includes('@c.us')) return phone;
        
        let clean = phone.toString().replace(/\D/g, '');
        
        if (clean.startsWith('0')) {
            clean = '62' + clean.substring(1);
        } else if (!clean.startsWith('62')) {
            clean = '62' + clean;
        }
        
        return clean + '@c.us';
    },
    
    // Format currency
    formatCurrency(amount) {
        if (window.POSModule && window.POSModule.formatCurrency) {
            return window.POSModule.formatCurrency(amount);
        }
        return new Intl.NumberFormat('id-ID').format(amount || 0);
    },
    
    // Fungsi kirim WA
    async sendWA(phoneNumber, message, recipientType = 'customer') {
        try {
            if (!window.appConfig?.wahaUrl || !window.appConfig?.wahaXApiKey) {
                console.error('❌ WhatsApp configuration not available');
                return false;
            }
            
            console.log(`📤 Sending WA to ${recipientType}: ${phoneNumber}`);
            
            const response = await fetch(window.appConfig.wahaUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': window.appConfig.wahaXApiKey
                },
                body: JSON.stringify({
                    session: window.appConfig.wahaSession,
                    chatId: phoneNumber,
                    text: message
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ WA API error for ${recipientType}:`, errorText);
                return false;
            }
            
            await response.json();
            console.log(`✅ WA sent to ${recipientType} successfully`);
            return true;
            
        } catch (error) {
            console.error(`❌ Error sending WA to ${recipientType}:`, error);
            return false;
        }
    },
    
    // =============================================
    // TEST FUNCTION
    // =============================================
    async test() {
        try {
            console.group('🧪 TESTING SERVER WA NOTIFICATION MODULE');
            
            const testData = {
                orderNo: 'TEST' + Date.now().toString().slice(-6),
                totalAmount: 75000,
                items: [
                    { nama_produk: 'Haircut Premium', quantity: 1, harga_jual: 50000, komisi: 7000 },
                    { nama_produk: 'Shampoo', quantity: 1, harga_jual: 25000, komisi: 3000 }
                ],
                servedBy: 'Usep Maulana',
                paymentType: 'cash',
                kasir: 'Devi',
                orderDate: new Date().toISOString().split('T')[0],
                orderTime: new Date().toLocaleTimeString('id-ID', { hour12: false }),
                subtotal: 75000,
                discountAmount: 0,
                redeemAmount: 0,
                cashReceived: 80000,
                cashChange: 5000
            };
            
            // Test 1: Check outlet config
            const user = Auth.getCurrentUser();
            const shouldSend = await this.checkOutletWANotification(user?.outlet);
            console.log(`1. Should send WA: ${shouldSend}`);
            
            // Test 2: Get server WA
            const serverWA = await this.getServerWANumber(testData.servedBy);
            console.log(`2. Server WA: ${serverWA}`);
            
            // Test 3: Create message
            const totalKomisi = testData.items.reduce((sum, item) => sum + (item.komisi || 0) * item.quantity, 0);
            const message = this.createServerNotification(
                testData.orderNo, testData.totalAmount, testData.items, testData.servedBy,
                testData.paymentType, testData.kasir, testData.orderDate, testData.orderTime,
                totalKomisi, testData.subtotal, testData.discountAmount, testData.redeemAmount,
                testData.cashReceived, testData.cashChange
            );
            
            console.log('3. Message sample:', message.substring(0, 150) + '...');
            
            // Test 4: Simulate send
            if (confirm('Test full function without sending? (No actual WA will be sent)')) {
                const originalSendWA = this.sendWA;
                this.sendWA = async () => {
                    console.log('📤 [MOCK] WA would be sent');
                    return true;
                };
                
                const result = await this.sendToServer(testData);
                console.log(`4. Function result: ${result}`);
                
                this.sendWA = originalSendWA;
            }
            
            console.groupEnd();
            console.log('✅ Test completed');
            
            return true;
            
        } catch (error) {
            console.error('❌ Test failed:', error);
            console.groupEnd();
            return false;
        }
    }
};

// Export untuk penggunaan global
window.WAServerNotification = WAServerNotification;
