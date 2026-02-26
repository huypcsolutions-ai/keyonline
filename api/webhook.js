import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { content, amount } = req.body; 
  // Giả sử nội dung là: "ORD12345_0987654321"
  const orderId = content.split('_')[0];

  // 1. Cập nhật trạng thái đơn hàng
  await supabase.from('orders').update({ status: 'completed' }).eq('order_id', orderId);

  // 2. Lấy Key từ kho
  const { data: keyData } = await supabase
    .from('keys_stock')
    .select('*')
    .eq('is_sold', false)
    .limit(1)
    .single();

  if (keyData) {
    // 3. Đánh dấu Key đã bán
    await supabase.from('keys_stock').update({ is_sold: true }).eq('id', keyData.id);
    
    // 4. Gửi Mail (Bạn dùng Resend hoặc dịch vụ gửi mail tại đây)
    console.log(`Gửi key ${keyData.serial_key} tới khách hàng`);
  }

  return res.status(200).json({ success: true });
}
