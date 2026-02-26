const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    const { orderId } = req.query;
    try {
        const { data } = await supabase.from('orders').select('status').eq('order_id', orderId).maybeSingle();
        return res.status(200).json({ status: data ? data.status : 'not_found' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
