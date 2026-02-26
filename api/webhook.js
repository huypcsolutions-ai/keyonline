const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --- HÀM GHI LỖI TỰ ĐỘNG ---
async function logError(error, context, reqData = null) {
    console.error(`[${context}]`, error);
    try {
        await supabase.from('errors_logs').insert([{
            error_message: error.message,
            error_stack: error.stack,
            context: context,
            request_data: reqData
        }]);
    } catch (dbErr) {
        console.error("Không thể ghi log vào Database:", dbErr);
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Lấy dữ liệu body để lưu nếu có lỗi
    const body = req.body;

    try {
        // 1. Kiểm tra Token bảo mật
        const authHeader = req.headers['authorization'] || '';
        const sepayToken = process.env.SEPAY_API_KEY;

        if (!sepayToken || !authHeader.includes(sepayToken)) {
            // Ghi lỗi nếu có kẻ cố tình truy cập trái phép
            await logError(new Error("Unauthorized Access"), "Webhook_Auth", { header: authHeader });
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { transferAmount, transferContent, gateway } = body;

        // 2. Lọc mã đơn hàng
        const orderMatch = transferContent.match(/ORD\d+/);
        const pureOrderId = orderMatch ? orderMatch[0] : null;

        if (!pureOrderId) {
            await logError(new Error("Mã đơn hàng không hợp lệ"), "Webhook_Regex", body);
            return res.status(200).json({ success: false, message: "No OrderID" });
        }

        // 3. Xử lý Database
        const { data: order, error: fetchError } = await supabase
            .from('orders')
            .select('*')
            .eq('order_id', pureOrderId)
            .single();

        if (fetchError || !order) {
            await logError(new Error(`Không tìm thấy đơn hàng: ${pureOrderId}`), "Webhook_DB_Fetch", body);
            return res.status(200).json({ success: false, message: "Order not found" });
        }

        // 4. Khớp tiền và cập nhật
        if (Number(transferAmount) >= Number(order.amount)) {
            const { error: updateError } = await supabase
                .from('orders')
                .update({ status: 'completed' })
                .eq('order_id', pureOrderId);

            if (updateError) throw updateError; // Ném lỗi để hàm catch xử lý

            return res.status(200).json({ success: true });
        } else {
            await logError(new Error("Số tiền chuyển khoản không đủ"), "Webhook_Amount_Mismatch", body);
            return res.status(200).json({ success: false });
        }

    } catch (err) {
        // 🔥 BẤT CỨ LỖI HỆ THỐNG NÀO CŨNG CHẠY VÀO ĐÂY
        await logError(err, "Webhook_Critical_System", body);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
