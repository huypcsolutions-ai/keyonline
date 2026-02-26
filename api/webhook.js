const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // Kiểm tra bảo mật API Key
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.includes(process.env.SEPAY_API_KEY)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { content, transferAmount } = req.body;

  try {
    // 1. Ghi log giao dịch để đối soát (Rất quan trọng khi bị lỗi)
    await supabase.from('transactions').insert([{
      content: content,
      transfer_amount: transferAmount,
      raw_data: req.body
    }]);

    // 2. TÌM ĐƠN HÀNG THÔNG MINH
    // Tìm đơn hàng mà 'content' của ngân hàng CHỨA 'order_id' của chúng ta
    // Ví dụ: "IB ORD782921" chứa "ORD782921"
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending'); // Lấy các đơn đang chờ

    if (error) throw error;

    // Lọc thủ công để tìm đơn hàng khớp mã
    const matchedOrder = orders.find(o => content.toUpperCase().includes(o.order_id.toUpperCase()));

    if (matchedOrder) {
      // 3. Kiểm tra số tiền
      if (Number(transferAmount) >= Number(matchedOrder.amount)) {
        // 4. Cập nhật trạng thái
        await supabase
          .from('orders')
          .update({ status: 'completed' })
          .eq('order_id', matchedOrder.order_id);
          
        console.log(`Khớp đơn hàng thành công: ${matchedOrder.order_id}`);
      }
    } else {
      console.log(`Nội dung "${content}" không khớp với đơn hàng pending nào.`);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
