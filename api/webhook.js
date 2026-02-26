const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // Kiểm tra bảo mật (API Key)
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.includes(process.env.SEPAY_API_KEY)) {
    return res.status(401).json({ error: 'Sai API Key' });
  }

  const payload = req.body;
  const { content, transferAmount, gateway } = payload;

  try {
    // 1. Tách Order ID
    const orderId = content.split('_')[0];

    // 2. GHI NHẬT KÝ GIAO DỊCH (Để theo dõi)
    await supabase.from('transactions').insert([{
      order_id: orderId,
      content: content,
      transfer_amount: transferAmount,
      gateway: gateway,
      raw_data: payload
    }]);

    // 3. Cập nhật đơn hàng
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (order && Number(transferAmount) >= Number(order.amount)) {
      await supabase.from('orders').update({ status: 'completed' }).eq('order_id', orderId);
      // Gửi mail tại đây...
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
