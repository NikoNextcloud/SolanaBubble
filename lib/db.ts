import { createClient } from "@supabase/supabase-js";
// Само server-side (service role).
export const admin = () =>
  createClient((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
