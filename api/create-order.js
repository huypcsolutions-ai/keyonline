const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { order_id, email, phone, total } = req.body;
  try {
    const { data, error } = await supabase
      .from('orders')
      .insert([{ 
        order_id, 
        customer_email: email, 
        customer_phone: phone, 
        amount: total, 
        status: 'pending' 
      }]);
    if (error) throw error;
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
