const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { orderId, productCode, amount, email, quantity } = req.body;

    try {
        // LƯU Ý: Tên bên trái là tên cột trong bảng 'orders' của bạn
        const { error } = await supabase.from('orders').insert([{
            order_id: orderId,
            product_code: productCode, 
            amount: amount,
            customer_email: email, 
            quantity: quantity,
            status: 'pending'
        }]);

        if (error) {
            console.error("Lỗi Supabase:", error);
            // Trả lỗi về cho HTML để hiện bảng thông báo
            return res.status(400).json({ error: error.message });
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
