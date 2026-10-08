"use client";
import {useEffect,useRef,useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {browserDb} from "@/lib/supabase-browser";
import styles from "./AccountMenu.module.css";

export default function AccountMenu(){
 const [open,setOpen]=useState(false),[email,setEmail]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const [session,setSession]=useState<Session|null>(null);
 const clientRef=useRef<ReturnType<typeof browserDb>|null>(null);

 useEffect(()=>{
  if(process.env.NEXT_PUBLIC_BROWSER_SMOKE==="1")return;
  const client=browserDb();clientRef.current=client;
  client.auth.getSession().then(({data})=>setSession(data.session??null)).catch(()=>{});
  const {data}=client.auth.onAuthStateChange((_event,next)=>setSession(next));
  return()=>data.subscription.unsubscribe();
 },[]);

 async function sendLink(){
  const value=email.trim().toLowerCase();
  if(!value||!value.includes("@")){setError("Въведи валиден email.");return;}
  setBusy(true);setError("");setMessage("");
  try{
   const client=clientRef.current??browserDb();
   const {error:authError}=await client.auth.signInWithOtp({email:value,options:{emailRedirectTo:window.location.origin}});
   if(authError)throw authError;
   setMessage("Изпратихме magic link. Отвори го на това устройство.");
  }catch{setError("Входът временно не е достъпен.");}
  finally{setBusy(false);}
 }

 async function signOut(){
  setBusy(true);setError("");
  try{await (clientRef.current??browserDb()).auth.signOut();setMessage("Излезе от акаунта. Anonymous sync остава като резервен режим.");}
  catch{setError("Неуспешно излизане.");}
  finally{setBusy(false);}
 }

 const label=session?.user.email?session.user.email.split("@")[0]:"SB";
 return <div className={styles.wrap}>
  <button type="button" className={[styles.trigger,session?styles.signed:""].filter(Boolean).join(" ")} aria-label="Account and sync" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><i className={styles.dot}/><span>{label.slice(0,2).toUpperCase()}</span></button>
  {open&&<div className={styles.panel}>
   <strong>{session?"Account sync active":"Optional account sync"}</strong>
   {session?<><small className={styles.status}>{session.user.email}</small><small>Watchlist, alert rules and preferences sync through your authenticated account. Anonymous sync remains as a device fallback for push delivery.</small><button type="button" disabled={busy} onClick={signOut}>Sign out</button></>:<>
    <small>Влез с email magic link, за да пренасяш Watchlist и alert настройките автоматично между устройствата. Не е нужен wallet private key.</small>
    <input value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@example.com" aria-label="Account email"/>
    <button type="button" className={styles.primary} disabled={busy} onClick={sendLink}>{busy?"Sending…":"Send magic link"}</button>
   </>}
   {message&&<small className={styles.status}>{message}</small>}{error&&<small className={styles.error}>{error}</small>}
   <small><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></small>
  </div>}
 </div>;
}
