const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = req.body;
    
    // 🛡️ Bảo mật
    const authHeader = req.headers['authorization'] || '';
    const sepayToken = process.env.SEPAY_API_KEY;
    if (!sepayToken || !authHeader.includes(sepayToken)) return res.status(401).json({ error: 'Unauthorized' });

    try {
        // Trích xuất dữ liệu từ log thực tế của SePay
        const amount = body.transferAmount;
        const description = body.description || body.content || "";
        const gateway = body.gateway;
        const transactionDate = body.transactionDate;
        const referenceCode = body.referenceCode;

        // Lọc mã ORD sạch
        const orderMatch = description.match(/ORD\d+/);
        const pureOrderId = orderMatch ? orderMatch[0] : null;

        // 📝 GHI VÀO TABLE TRANSACTIONS (Đã sửa tên trường cho chuẩn)
        await supabase.from('transactions').insert([{
            order_id: pureOrderId,          // Lưu mã sạch: ORD618772
            content: description,           // Lưu nguyên văn: IB ORD618772
            transfer_amount: amount,        // 8000
            gateway: gateway,               // ACB
            transaction_date: transactionDate, // 2026-02-26 15:14:25
            reference_code: referenceCode    // 4407
        }]);

        if (!pureOrderId) return res.status(200).json({ message: "No ORD found" });

        // 🏦 Xử lý cập nhật đơn hàng như cũ...
        const { data: order } = await supabase.from('orders').select('*').eq('order_id', pureOrderId).maybeSingle();

        if (order && order.status !== 'completed' && Number(amount) >= Number(order.amount)) {
            await supabase.from('orders').update({ status: 'completed' }).eq('order_id', pureOrderId);
        }

        return res.status(200).json({ success: true });

    } catch (err) {
        // Ghi log lỗi nếu có
        console.error(err);
        return res.status(500).json({ error: "Internal Error" });
    }
}
