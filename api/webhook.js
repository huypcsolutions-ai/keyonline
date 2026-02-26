const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    // Chỉ chấp nhận POST từ SePay
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = req.body;
    const { transferAmount, transferContent, referenceCode, gateway } = body;

    console.log("=== WEBHOOK NHẬN GIAO DỊCH MỚI ===");
    console.log("Nội dung:", transferContent);
    console.log("Số tiền:", transferAmount);

    try {
        // 1. Dùng REGEX để lọc sạch mã đơn hàng (Loại bỏ "IB", "MB", rác...)
        // Tìm chuỗi bắt đầu bằng ORD và theo sau là các chữ số
        const orderMatch = transferContent.match(/ORD\d+/);
        const pureOrderId = orderMatch ? orderMatch[0] : null;

        if (!pureOrderId) {
            console.error("❌ Lỗi: Không tìm thấy mã đơn hàng ORD trong nội dung chuyển khoản.");
            return res.status(200).json({ success: false, message: "No OrderID found" });
        }

        console.log("👉 Mã đơn hàng lọc sạch:", pureOrderId);

        // 2. Lưu vào bảng transactions để làm bằng chứng đối soát (Dù đơn có khớp hay không)
        const { error: tranError } = await supabase.from('transactions').insert([{
            order_id: pureOrderId, // Lưu mã đã lọc sạch để web tìm thấy
            content: transferContent,
            transfer_amount: transferAmount,
            transfer_type: gateway || 'Bank'
        }]);

        if (tranError) console.error("⚠️ Lỗi lưu transactions:", tranError.message);

        // 3. Tìm đơn hàng trong bảng orders
        const { data: order, error: fetchError } = await supabase
            .from('orders')
            .select('*')
            .eq('order_id', pureOrderId)
            .single();

        if (fetchError || !order) {
            console.error(`❌ Lỗi: Không tìm thấy đơn hàng ${pureOrderId} trong bảng orders.`);
            return res.status(200).json({ success: false, message: "Order not found in DB" });
        }

        // 4. Nếu đơn đã hoàn thành rồi thì dừng lại
        if (order.status === 'completed') {
            console.log("✅ Đơn hàng này đã được xử lý trước đó rồi.");
            return res.status(200).json({ success: true, message: "Already processed" });
        }

        // 5. Kiểm tra số tiền (Cho phép sai số nếu cần, ở đây là khớp 100% hoặc dư)
        if (Number(transferAmount) >= Number(order.amount)) {
            
            console.log(`💰 Tiền khớp! Đang cập nhật đơn ${pureOrderId}...`);

            // Cập nhật trạng thái thành 'completed'
            const { error: updateError } = await supabase
                .from('orders')
                .update({ status: 'completed' })
                .eq('order_id', pureOrderId);

            if (updateError) {
                console.error("❌ Lỗi khi cập nhật status orders:", updateError.message);
                throw updateError;
            }

            console.log("🚀 CẬP NHẬT THÀNH CÔNG! Web sẽ tự chuyển trang.");
            
            /* Gợi ý: Bạn có thể thêm code gửi Email chứa Key tại đây 
            */

            return res.status(200).json({ success: true });
        } else {
            console.warn(`⚠️ Số tiền không đủ: Cần ${order.amount} nhưng nhận ${transferAmount}`);
            return res.status(200).json({ success: false, message: "Amount mismatch" });
        }

    } catch (err) {
        console.error("🔥 CRITICAL ERROR Webhook:", err.message);
        return res.status(500).json({ error: err.message });
    }
}
