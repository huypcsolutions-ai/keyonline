const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    // SePay thường gửi Webhook qua method POST
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Chỉ chấp nhận phương thức POST' });
    }

    try {
        // Lấy dữ liệu SePay gửi về
        const { transferAmount, transferContent } = req.body;

        // Nếu không có nội dung chuyển khoản thì bỏ qua
        if (!transferContent) {
            return res.status(200).json({ success: true, message: 'Bỏ qua giao dịch không có nội dung' });
        }

        // 1. Tìm mã đơn hàng (ORD + 6 số) trong nội dung chuyển khoản
        const orderMatch = transferContent.match(/ORD\d{6}/);
        
        if (!orderMatch) {
            return res.status(200).json({ success: true, message: 'Không tìm thấy mã đơn hàng trong nội dung' });
        }

        const orderId = orderMatch[0]; // Lấy được mã, ví dụ: ORD123456

        // 2. Tìm đơn hàng trong Database
        const { data: order, error: fetchError } = await supabase
            .from('orders')
            .select('*')
            .eq('order_id', orderId)
            .single();

        if (fetchError || !order) {
            return res.status(200).json({ success: true, message: 'Đơn hàng không tồn tại' });
        }

        // Nếu đơn đã hoàn thành rồi thì bỏ qua để tránh gửi Key 2 lần
        if (order.status === 'completed') {
            return res.status(200).json({ success: true, message: 'Đơn hàng đã được xử lý trước đó' });
        }

        // 3. Kiểm tra số tiền khách chuyển có đủ không (Chấp nhận chuyển dư)
        if (parseInt(transferAmount) >= parseInt(order.amount)) {
            
            // 4. Cập nhật trạng thái đơn hàng thành 'completed'
            const { error: updateError } = await supabase
                .from('orders')
                .update({ status: 'completed' })
                .eq('order_id', orderId);

            if (updateError) {
                console.error("Lỗi cập nhật đơn:", updateError);
                return res.status(500).json({ error: 'Không thể cập nhật trạng thái đơn' });
            }

            /* =========================================================
               [QUAN TRỌNG] TẠI ĐÂY LÀ NƠI BẠN VIẾT LOGIC GỬI EMAIL
               1. Lấy Key từ bảng 'keys' dựa theo order.product_code và order.quantity
               2. Dùng Nodemailer/Resend để gửi Key vào order.customer_email
               ========================================================= */

            return res.status(200).json({ success: true, message: 'Thanh toán thành công, đã cập nhật đơn!' });
            
        } else {
            // Khách chuyển thiếu tiền
            return res.status(200).json({ success: true, message: 'Khách chuyển thiếu tiền' });
        }

    } catch (err) {
        console.error("Lỗi Webhook:", err);
        return res.status(500).json({ error: 'Lỗi server Webhook' });
    }
}
