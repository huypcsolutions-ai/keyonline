const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Cấu hình gửi mail bằng Gmail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD, // Mật khẩu ứng dụng 16 số
    },
});

async function logError(error, context, reqData = null) {
    console.error(`[${context}]`, error.message);
    try {
        await supabase.from('errors_logs').insert([{
            error_message: error.message,
            context: context,
            request_data: reqData
        }]);
    } catch (dbErr) { console.error("Ghi log lỗi thất bại"); }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = req.body;
    const authHeader = req.headers['authorization'] || '';
    if (!process.env.SEPAY_API_KEY || !authHeader.includes(process.env.SEPAY_API_KEY)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const amount = body.transferAmount;
        const description = body.description || body.content || "";
        const orderMatch = description.match(/ORD\d+/);
        const pureOrderId = orderMatch ? orderMatch[0] : null;

        if (!pureOrderId) return res.status(200).json({ message: "No ORD found" });

        // 1. Tìm đơn hàng
        const { data: order } = await supabase.from('orders').select('*').eq('order_id', pureOrderId).maybeSingle();
        if (!order || order.status === 'completed') return res.status(200).json({ message: "Skip" });

        // 2. Kiểm tra số tiền
        if (Number(amount) >= Number(order.amount)) {

            // 3. LẤY KEY TỪ KHO (Khớp ảnh: serial_key, is_sold)
            const { data: keys, error: keyErr } = await supabase
                .from('keys_stock')
                .select('*')
                .eq('product_code', order.code)
                .eq('is_sold', false)
                .limit(order.quantity || 1);

            if (keyErr || !keys || keys.length < (order.quantity || 1)) {
                await logError(new Error(`Hết kho sản phẩm: ${order.code}`), "OUT_OF_STOCK", body);
                return res.status(200).json({ message: "Out of stock" });
            }

            const keyString = keys.map(k => k.serial_key).join('<br>');

            // 4. CẬP NHẬT TRẠNG THÁI KEY (is_sold = TRUE)
            const keyIds = keys.map(k => k.id);
            await supabase.from('keys_stock').update({ is_sold: true, order_id: pureOrderId }).in('id', keyIds);

            // 5. CẬP NHẬT ĐƠN HÀNG
            await supabase.from('orders').update({ status: 'completed' }).eq('order_id', pureOrderId);

            // 6. GỬI MAIL QUA GMAIL
            const mailOptions = {
                from: `"Shop Key Online" <${process.env.GMAIL_USER}>`,
                to: order.customer_email,
                subject: `[Thành công] Key sản phẩm cho đơn hàng ${pureOrderId}`,
                html: `
                    <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
                        <h2 style="color: #4CAF50;">Thanh toán thành công!</h2>
                        <p>Chào bạn, đây là mã sản phẩm bạn đã mua:</p>
                        <div style="background: #f4f4f4; padding: 15px; border-left: 5px solid #4CAF50; font-size: 18px;">
                            <strong>${keyString}</strong>
                        </div>
                        <p>Mã đơn hàng: <b>${pureOrderId}</b></p>
                        <p>Sản phẩm: ${order.code}</p>
                        <hr>
                        <p style="font-size: 12px; color: #777;">Cảm ơn bạn đã tin tưởng dịch vụ của chúng tôi.</p>
                    </div>
                `,
            };

            await transporter.sendMail(mailOptions);
            return res.status(200).json({ success: true, message: "Email sent with key" });
        }

        return res.status(200).json({ message: "Amount mismatch" });

    } catch (err) {
        await logError(err, "WEBHOOK_CRASH", body);
        return res.status(500).json({ error: err.message });
    }
}
