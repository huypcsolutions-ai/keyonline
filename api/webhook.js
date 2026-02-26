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

// ... (các bước 1-5 giữ nguyên)

// 6. TẠO DANH SÁCH KEY DẠNG BẢNG CHO EMAIL
const keyRows = keys.map(k => `
    <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee; color: #555;">${order.code}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; color: #2e7d32; font-weight: bold; font-family: monospace;">${k.serial_key}</td>
    </tr>
`).join('');

const mailOptions = {
    from: `"Huypcsolutions Support" <${process.env.GMAIL_USER}>`,
    to: order.customer_email,
    subject: `🎉 Thanh toán thành công đơn hàng #${pureOrderId}`,
    html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #4caf50; padding: 20px; text-align: center; color: white;">
                <h1 style="margin: 0; font-size: 24px;">🎉 Thanh toán thành công!</h1>
            </div>
            
            <div style="padding: 30px; background-color: white;">
                <p style="margin-top: 0;">Chào bạn,</p>
                <p>Cảm ơn bạn đã ủng hộ <strong>Huypcsolutions</strong>. Đơn hàng của bạn đã được thanh toán hoàn tất.</p>
                
                <div style="background-color: #f9f9f9; border: 1px dashed #4caf50; padding: 15px; border-radius: 4px; margin: 20px 0;">
                    <p style="margin: 0; font-size: 14px;"><strong>Mã đơn hàng:</strong> #${pureOrderId}</p>
                    <p style="margin: 5px 0 0 0; font-size: 14px;"><strong>Sản phẩm:</strong> ${order.code}</p>
                </div>

                <h3 style="color: #4caf50; border-bottom: 2px solid #4caf50; padding-bottom: 5px;">🔑 Danh sách Key / Serial của bạn:</h3>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <thead>
                        <tr style="background-color: #f2f2f2; text-align: left;">
                            <th style="padding: 12px; font-size: 13px; text-transform: uppercase;">Sản phẩm</th>
                            <th style="padding: 12px; font-size: 13px; text-transform: uppercase;">Key / Serial</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${keyRows}
                    </tbody>
                </table>

                <div style="margin-top: 30px;">
                    <h3 style="color: #4caf50; display: flex; align-items: center;">🛠️ Hướng dẫn kích hoạt:</h3>
                    <ol style="padding-left: 20px; color: #555; font-size: 14px; line-height: 1.8;">
                        <li>Truy cập link: <a href="#" style="color: #4caf50; font-weight: bold; text-decoration: none;">Kích hoạt tại đây</a></li>
                        <li>Đăng nhập tài khoản của bạn.</li>
                        <li>Nhập <strong>"Mã key"</strong> để hoàn tất.</li>
                    </ol>
                </div>

                <p style="font-size: 13px; color: #888; margin-top: 30px; border-top: 1px solid #eee; pt: 20px;">
                    Nếu gặp khó khăn, vui lòng liên hệ Zalo hỗ trợ kỹ thuật.<br>
                    Trân trọng,<br>
                    <strong>Đội ngũ Huypcsolutions Support</strong>
                </p>
            </div>
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
