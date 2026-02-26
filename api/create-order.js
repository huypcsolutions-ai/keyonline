const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const { orderId, productCode, amount, email, quantity } = req.body;

    try {
        const { error } = await supabase.from('orders').insert([{
            order_id: orderId,
            product_code: productCode,
            amount: amount,
            customer_email: email,
            quantity: quantity || 1,
            status: 'pending'
        }]);
        if (error) throw error;
        return res.status(200).json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
