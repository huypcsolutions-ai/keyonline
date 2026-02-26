const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function logError(error, context, reqData = null) {
    console.error(`[${context}]`, error.message);
    try {
        await supabase.from('errors_logs').insert([{
            error_message: error.message,
            error_stack: error.stack,
            context: context,
            request_data: reqData
        }]);
    } catch (dbErr) {
        console.error("Không thể ghi log vào DB:", dbErr.message);
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = req.body;
    
    // 🛡️ KIỂM TRA TOKEN BẢO MẬT
    const authHeader = req.headers['authorization'] || '';
    const sepayToken = process.env.SEPAY_API_KEY;
    if (!sepayToken || !authHeader.includes(sepayToken)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // 🔍 LẤY DỮ LIỆU (Sửa lại theo đúng log của bạn: dùng 'description' hoặc 'content')
        const transferAmount = body.transferAmount;
        const rawContent = body.description || body.content || ""; 

        // 🎯 REGEX: Trích xuất mã ORD (Ví dụ: "IB ORD618772" -> "ORD618772")
        const orderMatch = rawContent.match(/ORD\d+/);
        const pureOrderId = orderMatch ? orderMatch[0] : null;

        if (!pureOrderId) {
            await logError(new Error("Không tìm thấy mã ORD trong description"), "Webhook_No_ID", body);
            return res.status(200).json({ success: false, message: "No OrderID found" });
        }

        // 📝 LƯU TRANSACTION (Ghi log giao dịch vào bảng transactions)
        await supabase.from('transactions').insert([{
            order_id: pureOrderId,
            content: rawContent,
            transfer_amount: transferAmount,
            transfer_type: body.gateway || 'ACB'
        }]);

        // 🏦 TÌM ĐƠN HÀNG
        const { data: order, error: fetchError } = await supabase
            .from('orders')
            .select('*')
            .eq('order_id', pureOrderId)
            .maybeSingle();

        if (fetchError || !order) {
            await logError(new Error(`Đơn hàng ${pureOrderId} không tồn tại`), "Webhook_DB_NotFound", body);
            return res.status(200).json({ success: false, message: "Order not found" });
        }

        if (order.status === 'completed') return res.status(200).json({ success: true });

        // 💰 KIỂM TRA SỐ TIỀN VÀ CẬP NHẬT
        if (Number(transferAmount) >= Number(order.amount)) {
            const { error: updateError } = await supabase
                .from('orders')
                .update({ status: 'completed' })
                .eq('order_id', pureOrderId);

            if (updateError) throw updateError;
            return res.status(200).json({ success: true });
        } else {
            await logError(new Error(`Sai tiền: Cần ${order.amount} - Nhận ${transferAmount}`), "Webhook_Money_Short", body);
            return res.status(200).json({ success: false });
        }

    } catch (err) {
        await logError(err, "Webhook_Final_Catch", body);
        return res.status(500).json({ error: "Internal Server Error", detail: err.message });
    }
}
