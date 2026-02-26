import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { order_id, email, phone, total } = req.body;

  // Lưu thông tin đơn hàng vào bảng 'orders' với trạng thái 'pending'
  const { data, error } = await supabase
    .from('orders')
    .insert([
      { 
        order_id: order_id, 
        customer_email: email, 
        customer_phone: phone, 
        total_amount: parseInt(total),
        status: 'pending' 
      }
    ]);

  if (error) return res.status(500).json({ error: error.message });
  
  return res.status(200).json({ success: true, message: "Đã tạo đơn hàng chờ thanh toán" });
}
