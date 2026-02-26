const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.includes(process.env.SEPAY_API_KEY)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { content, transferAmount } = req.body;

    try {
        // 1. Tìm đơn hàng khớp mã (Xử lý thông minh khi có tiền tố IB, MB...)
        const { data: pendingOrders } = await supabase.from('orders').select('*').eq('status', 'pending');
        const matchedOrder = pendingOrders.find(o => content.toUpperCase().includes(o.order_id.toUpperCase()));

        if (!matchedOrder || Number(transferAmount) < Number(matchedOrder.amount)) {
            return res.status(200).json({ message: 'Order not found or invalid' });
        }

        // 2. Lấy Key từ kho (Bảng keys_stock)
        const { data: keys } = await supabase
            .from('keys_stock')
            .select('id, serial_key')
            .eq('product_code', matchedOrder.product_code)
            .eq('is_sold', false)
            .limit(matchedOrder.quantity || 1);

        if (!keys || keys.length < (matchedOrder.quantity || 1)) {
            return res.status(200).json({ message: 'Out of stock' });
        }

        const listKeys = keys.map(k => k.serial_key);
        const keyIds = keys.map(k => k.id);

        // 3. Cập nhật trạng thái Database
        await supabase.from('keys_stock').update({ is_sold: true, order_id: matchedOrder.order_id }).in('id', keyIds);
        await supabase.from('orders').update({ status: 'completed' }).eq('order_id', matchedOrder.order_id);

        // 4. Gửi Email bằng Gmail (Nodemailer)
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_APP_PASSWORD
            }
        });

        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden;">
                <div style="background: #2563eb; padding: 30px; text-align: center; color: white;">
                    <h1 style="margin: 0;">FASTKEY Giao Hàng</h1>
                </div>
                <div style="padding: 30px; background: white;">
                    <p>Chào bạn,</p>
                    <p>Đơn hàng <b>#${matchedOrder.order_id}</b> đã thanh toán thành công. Dưới đây là mã sản phẩm của bạn:</p>
                    <div style="background: #f1f5f9; padding: 20px; border-radius: 10px; margin: 20px 0;">
                        ${listKeys.map(k => `<div style="padding: 10px; border-bottom: 1px solid #cbd5e1; font-family: monospace; font-size: 18px; color: #1d4ed8;">• <b>${k}</b></div>`).join('')}
                    </div>
                    <p style="font-size: 12px; color: #64748b;">Lưu ý: Không chia sẻ mã này cho bất kỳ ai.</p>
                </div>
                <div style="padding: 20px; background: #f8fafc; text-align: center; font-size: 12px; color: #94a3b8;">
                    Cảm ơn bạn đã tin dùng dịch vụ của chúng tôi!
                </div>
            </div>
        `;

        await transporter.sendMail({
            from: `"FastKey Store" <${process.env.GMAIL_USER}>`,
            to: matchedOrder.customer_email,
            subject: `[FastKey] Giao mã Key đơn hàng #${matchedOrder.order_id}`,
            html: emailHtml
        });

        return res.status(200).json({ success: true });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
};
