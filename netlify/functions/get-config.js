// netlify/functions/get-config.js
exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      // Supabase
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
      
      // WhatsApp
      wahaUrl: process.env.WAHA_URL || '',
      wahaXApiKey: process.env.WAHA_X_API_KEY || '',
      wahaSession: process.env.WAHA_SESSION || '',
      
      // Status
      status: 'ok'
    })
  };
};
