const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { content, amount } = req.body; 
  const orderId = content.split('_')[0]; // Lấy mã ORDxxxxx

  try {
    // 1. Kiểm tra đơn hàng trong DB
    const { data: order } = await supabase.from('orders').select('*').eq('order_id', orderId).single();
    if (!order || order.status === 'completed') return res.status(200).send('Done');

    // 2. Lấy 1 Key chưa bán từ kho
    const { data: keyData } = await supabase.from('keys_stock').select('*').eq('is_sold', false).limit(1).single();

    if (keyData) {
      // 3. Cập nhật đơn hàng & Đánh dấu Key đã bán
      await supabase.from('orders').update({ status: 'completed' }).eq('order_id', orderId);
      await supabase.from('keys_stock').update({ is_sold: true }).eq('id', keyData.id);

      // 4. Gửi Email tự động qua Resend
      await resend.emails.send({
        from: 'Store <onboarding@resend.dev>',
        to: order.customer_email,
        subject: `Mã sản phẩm của bạn: ${orderId}`,
        html: `<h3>Cảm ơn bạn đã mua hàng!</h3><p>Mã Key của bạn là: <b>${keyData.serial_key}</b></p>`
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).send(err.message);
  }
};
