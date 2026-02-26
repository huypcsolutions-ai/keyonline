const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  const { orderId } = req.query;
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('status')
      .eq('order_id', orderId)
      .single();
    if (error) throw error;
    res.status(200).json(data);
  } catch (err) {
    res.status(404).json({ status: 'not_found' });
  }
};
