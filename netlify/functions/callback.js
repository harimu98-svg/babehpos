// netlify/functions/callback.js - VERSI GABUNGAN (IPAYMU CALLBACK + STATUS CHECK)
const crypto = require('crypto');

exports.handler = async function(event, context) {
  // ✅ SET CORS HEADERS
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.POS_BASE_URL || '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // ✅ HANDLE PREFLIGHT REQUEST
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // ✅ HANDLE STATUS CHECK REQUEST (untuk polling dari frontend)
  if (event.httpMethod === 'POST' && event.body) {
    try {
      const body = JSON.parse(event.body);
      
      if (body.referenceId && body.action === 'checkStatus') {
        console.log('🔍 Status check requested for:', body.referenceId);
        
        const callbackData = await getCallbackFromStorage(body.referenceId);
        
        if (callbackData) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              exists: true,
              status: callbackData.status,
              status_code: callbackData.status_code,
              reference_id: callbackData.reference_id,
              amount: callbackData.amount,
              paid_at: callbackData.paid_at,
              received_at: callbackData.received_at,
              trx_id: callbackData.trx_id
            })
          };
        } else {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              exists: false,
              reference_id: body.referenceId,
              status: 'pending'
            })
          };
        }
      }
    } catch (e) {
      // Continue to callback processing
    }
  }

  // ✅ HANDLE IPAYMU CALLBACK (dari iPaymu server)
  try {
    console.log("📨 iPaymu Callback Received - Method:", event.httpMethod);
    console.log("📨 Headers:", JSON.stringify(event.headers, null, 2));
    console.log("📨 Body:", event.body);

    let callbackData;

    // Handle form-data (production callback dari iPaymu)
    if (event.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(event.body);
      callbackData = {
        trx_id: params.get('trx_id'),
        status: params.get('status'),
        status_code: params.get('status_code'),
        sid: params.get('sid'),
        reference_id: params.get('reference_id'),
        amount: params.get('amount'),
        paid_at: params.get('paid_at'),
        sub_total: params.get('sub_total'),
        total: params.get('total'),
        fee: params.get('fee'),
        paid_off: params.get('paid_off'),
        created_at: params.get('created_at'),
        expired_at: params.get('expired_at'),
        settlement_status: params.get('settlement_status'),
        via: params.get('via'),
        channel: params.get('channel'),
        buyer_name: params.get('buyer_name'),
        buyer_email: params.get('buyer_email'),
        buyer_phone: params.get('buyer_phone'),
        source: 'ipaymu_production'
      };
    } 
    // Handle JSON (simulation atau testing)
    else if (event.headers['content-type']?.includes('application/json')) {
      callbackData = JSON.parse(event.body);
      callbackData.source = 'ipaymu_simulation';
    } else {
      try {
        callbackData = JSON.parse(event.body);
        callbackData.source = 'auto_detected';
      } catch (e) {
        callbackData = { raw: event.body, source: 'unknown' };
      }
    }

    console.log("💳 iPaymu Callback Parsed:", JSON.stringify(callbackData, null, 2));

    // ✅ SIMPAN CALLBACK DATA
    if (callbackData.reference_id) {
      await saveCallbackToStorage(callbackData);
      console.log(`💾 Callback stored: ${callbackData.reference_id} = ${callbackData.status}`);
    }

    // ✅ PROSES BUSINESS LOGIC JIKA PEMBAYARAN BERHASIL
    if (callbackData.status === 'berhasil') {
      await processSuccessfulPayment(callbackData);
    }

    return { 
      statusCode: 200, 
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: "Callback processed successfully",
        reference_id: callbackData.reference_id,
        status: callbackData.status,
        amount: callbackData.amount,
        stored: true,
        timestamp: new Date().toISOString()
      }) 
    };

  } catch (err) {
    console.error("❌ Callback processing error:", err);
    return { 
      statusCode: 500, 
      headers,
      body: JSON.stringify({ 
        error: "Callback processing failed",
        message: err.message
      }) 
    };
  }
};

// ✅ SIMPLE STORAGE FUNCTIONS
async function saveCallbackToStorage(callbackData) {
  try {
    if (typeof global.paymentCallbacks === 'undefined') {
      global.paymentCallbacks = new Map();
    }
    
    global.paymentCallbacks.set(callbackData.reference_id, {
      ...callbackData,
      received_at: new Date().toISOString(),
      processed: true
    });
    
    console.log(`✅ Callback saved to storage: ${callbackData.reference_id}`);
  } catch (error) {
    console.error('❌ Storage save error:', error);
  }
}

async function getCallbackFromStorage(referenceId) {
  try {
    if (typeof global.paymentCallbacks !== 'undefined') {
      const data = global.paymentCallbacks.get(referenceId);
      console.log(`📂 Retrieved from storage: ${referenceId} = ${data?.status}`);
      return data;
    }
    return null;
  } catch (error) {
    console.error('❌ Storage get error:', error);
    return null;
  }
}

// ✅ BUSINESS LOGIC UNTUK PEMBAYARAN BERHASIL
async function processSuccessfulPayment(callbackData) {
  const { reference_id, status, amount, paid_at } = callbackData;
  
  console.log(`🎯 Processing successful payment: ${reference_id} - ${amount} - ${paid_at}`);
  
  try {
    // Update status di database berdasarkan reference_id
    await updateTransactionStatusByReference(reference_id, {
      ipaymu_status: status,
      ipaymu_paid_at: paid_at,
      status: status === 'berhasil' ? 'completed' : 'pending'
    });
    
    console.log(`💰 Payment success processed: ${reference_id}`);
  } catch (error) {
    console.error(`❌ Error processing payment success: ${error.message}`);
  }
  
  return true;
}

// ✅ UPDATE STATUS DI DATABASE BERDASARKAN REFERENCE ID
async function updateTransactionStatusByReference(ipaymuReference, updateData) {
  try {
    // Update transaksi_detail
    const { error: detailError } = await supabase
      .from('transaksi_detail')
      .update(updateData)
      .eq('ipaymu_reference_id', ipaymuReference);
      
    if (detailError) throw detailError;

    // Update transaksi_order
    const { error: orderError } = await supabase
      .from('transaksi_order')
      .update(updateData)
      .eq('ipaymu_reference_id', ipaymuReference);
      
    if (orderError) throw orderError;

    console.log(`✅ Both tables updated for: ${ipaymuReference}`);
  } catch (error) {
    console.error('❌ Error updating database:', error);
  }
}
