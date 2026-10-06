import { createClient } from "@supabase/supabase-js";

export const admin=()=>{
  const u=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!u||!k)throw Error("Supabase env missing");
  return createClient(u,k,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
};
