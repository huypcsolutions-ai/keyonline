const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // --- 🛡️ LỚP BẢO MẬT: CHỐNG GIẢ MẠO ---
    // SePay gửi API Key (Webhook Token) qua Header 'Authorization' hoặc 'x-api-key'
    // Tùy cấu hình trên SePay, thông thường là: Bearer <API_KEY>
    const authHeader = req.headers['authorization'];
    const expectedKey = `Bearer ${process.env.SEPAY_API_KEY}`;

    if (!authHeader || authHeader !== expectedKey) {
        console.error("🚫 CẢNH BÁO: Truy cập giả mạo bị chặn! Token không khớp.");
        return res.status(401).json({ error: 'Unauthorized - Fake request detected' });
    }
    // --------------------------------------

    const { transferAmount, transferContent, gateway } = req.body;

    try {
        // 1. Regex lọc mã đơn hàng sạch
        const orderMatch = transferContent.match(/ORD\d+/);
        const pureOrderId = orderMatch ? orderMatch[0] : null;

        if (!pureOrderId) {
            return res.status(200).json({ success: false, message: "No OrderID" });
        }

        // 2. Lưu giao dịch vào transactions (Lưu vết để đối soát)
        await supabase.from('transactions').insert([{
            order_id: pureOrderId,
            content: transferContent,
            transfer_amount: transferAmount,
            transfer_type: gateway || 'Bank'
        }]);

        // 3. Tìm đơn hàng
        const { data: order, error: fetchError } = await supabase
            .from('orders')
            .select('*')
            .eq('order_id', pureOrderId)
            .single();

        if (fetchError || !order) {
            return res.status(200).json({ success: false, message: "Order not found" });
        }

        if (order.status === 'completed') {
            return res.status(200).json({ success: true, message: "Already processed" });
        }

        // 4. Khớp tiền
        if (Number(transferAmount) >= Number(order.amount)) {
            // Cập nhật đơn hàng
            await supabase.from('orders')
                .update({ status: 'completed' })
                .eq('order_id', pureOrderId);

            console.log(`✅ Xác thực thành công đơn hàng: ${pureOrderId}`);
            return res.status(200).json({ success: true });
        }

        return res.status(200).json({ success: false, message: "Amount mismatch" });

    } catch (err) {
        console.error("🔥 Lỗi Webhook:", err.message);
        return res.status(500).json({ error: err.message });
    }
}
