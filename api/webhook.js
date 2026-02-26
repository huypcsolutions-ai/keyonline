const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // --- BƯỚC CHỐNG GIẢ MẠO ---
  const authHeader = req.headers['authorization']; 
  // SePay thường gửi: Authorization: Apikey {YOUR_SECRET_KEY}
  const secretKey = process.env.SEPAY_API_KEY;

  if (!authHeader || !authHeader.includes(secretKey)) {
    console.error("Cảnh báo: Có kẻ đang giả mạo Webhook!");
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // --------------------------

  const { content, transferAmount } = req.body;

  try {
    // 1. Tách Order ID từ nội dung chuyển khoản (Ví dụ: ORD123456_098)
    const orderId = content.split('_')[0]; 

    // 2. Tìm đơn hàng đang chờ
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .eq('status', 'pending') // Chỉ xử lý đơn chưa thanh toán
      .single();

    if (!order) return res.status(200).json({ message: 'Order already processed or not found' });

    // 3. Kiểm tra số tiền nhận được
    if (Number(transferAmount) >= Number(order.amount)) {
      
      // 4. Cập nhật trạng thái thành công
      await supabase
        .from('orders')
        .update({ status: 'completed' })
        .eq('order_id', orderId);

      // 5. Logic gửi email và lấy Key có thể thêm tại đây...
      console.log(`Xác thực thành công đơn hàng: ${orderId}`);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
