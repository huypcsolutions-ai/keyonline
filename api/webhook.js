const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const payload = req.body;
    const { content, transferAmount } = payload;
    const authHeader = req.headers['authorization'];

    const logError = async (orderId, msg) => {
        await supabase.from('error_logs').insert([{ order_id: orderId || 'UNKNOWN', error_message: msg, raw_payload: payload }]);
    };

    try {
        if (!authHeader || !authHeader.includes(process.env.SEPAY_API_KEY)) return res.status(401).send('Unauthorized');

        // Trích xuất Order ID: lấy phần trước dấu _ và xóa tiền tố ngân hàng
        let orderId = content.split('_')[0].replace(/(IB|MB|FT|CK)/gi, "").trim();

        const { data: order } = await supabase.from('orders').select('*').eq('order_id', orderId).eq('status', 'pending').single();

        if (!order) {
            await logError(orderId, `Không tìm thấy đơn hàng pending khớp với: ${content}`);
            return res.status(200).json({ message: 'Order not found' });
        }

        if (Number(transferAmount) < Number(order.amount)) {
            await logError(orderId, `Thiếu tiền: Nhận ${transferAmount} - Cần ${order.amount}`);
            return res.status(200).json({ message: 'Amount mismatch' });
        }

        // Lấy Key từ kho
        const { data: keys } = await supabase.from('keys_stock').select('id, serial_key')
            .eq('product_code', order.product_code).eq('is_sold', false).limit(order.quantity);

        if (!keys || keys.length < order.quantity) {
            await logError(orderId, `HẾT KHO sản phẩm: ${order.product_code}`);
            return res.status(200).json({ message: 'Out of stock' });
        }

        const listKeys = keys.map(k => k.serial_key);
        
        // Cập nhật DB
        await supabase.from('keys_stock').update({ is_sold: true, order_id: orderId }).in('id', keys.map(k => k.id));
        await supabase.from('orders').update({ status: 'completed' }).eq('order_id', orderId);

        // Gửi Mail
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
        });

        await transporter.sendMail({
            from: `"FastKey Store" <${process.env.GMAIL_USER}>`,
            to: order.customer_email,
            subject: `[FastKey] Giao mã đơn hàng #${orderId}`,
            html: `<div style="font-family:sans-serif;padding:20px;border:1px solid #eee;border-radius:10px;">
                <h2 style="color:#2563eb;">Thanh toán thành công!</h2>
                <p>Mã đơn hàng: <b>#${orderId}</b></p>
                <div style="background:#f1f5f9;padding:15px;font-size:18px;font-family:monospace;">
                    ${listKeys.map(k => `<div>• <b>${k}</b></div>`).join('')}
                </div>
            </div>`
        });

        return res.status(200).json({ success: true });
    } catch (err) {
        await logError('CRITICAL', err.message);
        return res.status(500).json({ error: err.message });
    }
}
