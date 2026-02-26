const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
    // Chỉ chấp nhận POST từ SePay
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const payload = req.body;
    const { content, transferAmount } = payload;
    
    // Hàm phụ để ghi log lỗi nhanh
    const logError = async (orderId, message) => {
        await supabase.from('error_logs').insert([{
            order_id: orderId || 'UNKNOWN',
            error_message: message,
            raw_payload: payload
        }]);
    };

    try {
        // 1. Kiểm tra bảo mật API Key của SePay
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.includes(process.env.SEPAY_API_KEY)) {
            await logError('SECURITY', 'Sai hoặc thiếu API Key trong Header');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!content) {
            await logError('EMPTY', 'Nội dung chuyển khoản rỗng');
            return res.status(400).json({ error: 'No content' });
        }

        // 2. Trích xuất Order ID (Xử lý thông minh các loại tiền tố IB, MB, chuyển khoản nhanh...)
        // Lấy phần đầu trước dấu gạch dưới, xóa khoảng trắng và tiền tố ngân hàng phổ biến
        let orderId = content.split('_')[0].replace(/(IB|MB|FT|CK)/gi, "").trim();

        // 3. Tìm đơn hàng đang 'pending'
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('*')
            .eq('order_id', orderId)
            .eq('status', 'pending')
            .single();

        if (orderError || !order) {
            await logError(orderId, `Không tìm thấy đơn hàng pending khớp với nội dung: ${content}`);
            return res.status(200).json({ message: 'Order not found' });
        }

        // 4. Kiểm tra số tiền nhận được
        if (Number(transferAmount) < Number(order.amount)) {
            await logError(orderId, `Thiếu tiền: Cần ${order.amount} nhưng nhận ${transferAmount}`);
            return res.status(200).json({ message: 'Insufficient amount' });
        }

        // 5. Lấy Key từ kho (Bảng keys_stock)
        const { data: keys, error: keyError } = await supabase
            .from('keys_stock')
            .select('id, serial_key')
            .eq('product_code', order.product_code)
            .eq('is_sold', false)
            .limit(order.quantity || 1);

        if (keyError || !keys || keys.length < (order.quantity || 1)) {
            await logError(orderId, `HẾT KHO: Loại ${order.product_code} không đủ ${order.quantity} keys`);
            return res.status(200).json({ message: 'Out of stock' });
        }

        const listKeys = keys.map(k => k.serial_key);
        const keyIds = keys.map(k => k.id);

        // 6. CẬP NHẬT TRẠNG THÁI (Thực hiện đồng thời)
        const updateStock = supabase.from('keys_stock').update({ is_sold: true, order_id: orderId }).in('id', keyIds);
        const updateOrder = supabase.from('orders').update({ status: 'completed' }).eq('order_id', orderId);
        
        await Promise.all([updateStock, updateOrder]);

        // 7. GỬI MAIL (Cấu hình Gmail Nodemailer)
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_APP_PASSWORD
            }
        });

        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                <div style="background: #2563eb; padding: 20px; text-align: center; color: white;">
                    <h2 style="margin: 0;">GIAO HÀNG THÀNH CÔNG</h2>
                </div>
                <div style="padding: 25px; line-height: 1.6;">
                    <p>Chào bạn, đơn hàng <b>#${orderId}</b> đã được thanh toán.</p>
                    <p>Đây là mã Key sản phẩm <b>${order.product_code}</b> của bạn:</p>
                    <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 18px; color: #1e40af;">
                        ${listKeys.map(k => `<div style="padding: 5px 0;">• <b>${k}</b></div>`).join('')}
                    </div>
                </div>
                <div style="background: #f8fafc; padding: 15px; text-align: center; font-size: 12px; color: #64748b;">
                    Email này được gửi tự động. Vui lòng không trả lời.
                </div>
            </div>
        `;

        try {
            await transporter.sendMail({
                from: `"FastKey Store" <${process.env.GMAIL_USER}>`,
                to: order.customer_email || order.email,
                subject: `[FastKey] Mã Key của đơn hàng #${orderId}`,
                html: emailHtml
            });
        } catch (mailErr) {
            await logError(orderId, `Lỗi gửi Mail: ${mailErr.message}`);
        }

        console.log(`Hoàn tất đơn hàng ${orderId}`);
        return res.status(200).json({ success: true });

    } catch (err) {
        await logError('CRITICAL', `Lỗi hệ thống Webhook: ${err.message}`);
        return res.status(500).json({ error: err.message });
    }
};
