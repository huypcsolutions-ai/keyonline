const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  const { orderId } = req.query;
  const { data } = await supabase.from('orders').select('status').eq('order_id', orderId).single();
  return res.status(200).json(data);
};
