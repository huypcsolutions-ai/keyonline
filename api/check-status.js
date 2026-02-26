const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  const { orderId } = req.query;
  if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('status')
      .eq('order_id', orderId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ status: 'not_found' });

    return res.status(200).json({ status: data.status });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
