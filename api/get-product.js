import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const { code } = req.query; // Lấy mã sản phẩm từ URL
  
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('code', code)
    .eq('is_active', true)
    .single();

  if (error || !data) return res.status(404).json({ message: "Không tìm thấy sản phẩm" });
  
  return res.status(200).json(data);
}
