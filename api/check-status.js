const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  const { orderId } = req.query;

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('status')
      .eq('order_id', orderId)
      .maybeSingle(); // Sử dụng maybeSingle để không báo lỗi khi không tìm thấy

    if (error) throw error;

    if (!data) {
      return res.status(200).json({ status: 'not_found', message: 'Không tìm thấy đơn hàng trong DB' });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
