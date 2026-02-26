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
        // 1. Lấy danh sách đơn hàng đang chờ
        const { data: pendingOrders } = await supabase.from('orders').select('*').eq('status', 'pending');
        
        // 2. Tìm đơn hàng khớp mã (Tìm mã đơn trong nội dung chuyển khoản)
        const matchedOrder = pendingOrders?.find(o => content.toUpperCase().includes(o.order_id.toUpperCase()));

        if (!matchedOrder || Number(transferAmount) < Number(matchedOrder.amount)) {
            return res.status(200).json({ message: 'Order not found or invalid' });
        }

        // 3. Lấy Key từ kho keys_stock
        const { data: keys } = await supabase
            .from('keys_stock')
            .select('id, serial_key')
            .eq('product_code', matchedOrder.product_code)
            .eq('is_sold', false)
            .limit(matchedOrder.quantity || 1);

        if (!keys || keys.length < (matchedOrder.quantity || 1)) {
            console.error("HẾT HÀNG TRONG KHO");
            return res.status(200).json({ message: 'Out of stock' });
        }

        const listKeys = keys.map(k => k.serial_key);
        const keyIds = keys.map(k => k.id);

        // 4. Cập nhật Database (Sử dụng 'completed')
        await supabase.from('keys_stock').update({ is_sold: true, order_id: matchedOrder.order_id }).in('id', keyIds);
        await supabase.from('orders').update({ status: 'completed' }).eq('order_id', matchedOrder.order_id);

        // 5. Gửi Mail bằng Gmail
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_APP_PASSWORD
            }
        });

        const emailHtml = `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 15px; overflow: hidden;">
                <div style="background: #2563eb; padding: 20px; text-align: center; color: white;">
                    <h2>THANH TOÁN THÀNH CÔNG</h2>
                </div>
                <div style="padding: 20px;">
                    <p>Chào bạn, đơn hàng <b>#${matchedOrder.order_id}</b> đã hoàn tất.</p>
                    <p>Mã sản phẩm của bạn là:</p>
                    <div style="background: #f8fafc; padding: 15px; border-left: 4px solid #2563eb; font-family: monospace; font-size: 18px;">
                        ${listKeys.map(k => `<div>• <b>${k}</b></div>`).join('')}
                    </div>
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
        return res.status(500).json({ error: err.message });
    }
};
