const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  // Cho phép gọi từ trình duyệt
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const { orderId } = req.query;

  if (!orderId) {
    return res.status(400).json({ error: "Thiếu mã đơn hàng" });
  }

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('status')
      .eq('order_id', orderId)
      .single();

    if (error || !data) {
      return res.status(404).json({ status: 'not_found' });
    }

    // Trả về status: 'pending' hoặc 'completed'
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
