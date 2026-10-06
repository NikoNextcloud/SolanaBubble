"use client";
import {useEffect,useState,useCallback,useRef} from "react";
import {emptyWatchState,normalizeWatchState,evaluatePersonalAlerts,type WatchState,type WatchToken} from "@/lib/watchlist";
import {emptySmartWatchState,normalizeSmartWatchState,evaluateSmartPersonalAlerts,type SmartWatchState} from "@/lib/watchlist-smart";

const KEY="solanabubble:watchlist:v1",EVENT="solanabubble:watchlist-change",SYNC_KEY="solanabubble:watch-sync-key:v1",SYNC_RE=/^[a-f0-9]{64}$/;
let pushTimer:ReturnType<typeof setTimeout>|null=null;
type ClientWatchState=WatchState&SmartWatchState;
const emptyClientState=():ClientWatchState=>({...emptyWatchState(),...emptySmartWatchState()});
const normalizeClient=(raw:any):ClientWatchState=>({...normalizeWatchState(raw),...normalizeSmartWatchState(raw)});

function read(){try{return normalizeClient(JSON.parse(localStorage.getItem(KEY)??localStorage.getItem("solanabubble:wishlist")??"null"));}catch{return emptyClientState();}}
function write(state:ClientWatchState){localStorage.setItem(KEY,JSON.stringify(state));}
function createSyncKey(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");}
function ensureSyncKey(){try{const existing=(localStorage.getItem(SYNC_KEY)||"").toLowerCase();if(SYNC_RE.test(existing))return existing;const next=createSyncKey();localStorage.setItem(SYNC_KEY,next);return next;}catch{return "";}}
async function pullRemote(key:string){const response=await fetch("/api/watchlist/sync",{headers:{"x-solanabubble-sync-key":key},cache:"no-store"});if(response.status===404)return null;if(!response.ok)throw new Error("sync");return normalizeClient((await response.json()).state);}
async function pushRemote(key:string,state:ClientWatchState){const response=await fetch("/api/watchlist/sync",{method:"PUT",headers:{"content-type":"application/json","x-solanabubble-sync-key":key},body:JSON.stringify(state),cache:"no-store"});if(!response.ok)throw new Error("sync");}
function queuePush(key:string,state:ClientWatchState){if(!key)return;if(pushTimer)clearTimeout(pushTimer);pushTimer=setTimeout(()=>{pushRemote(key,state).catch(()=>{});},650);}

export function useWatchlist(){
 const [state,setState]=useState<ClientWatchState>(emptyClientState);
 const [ready,setReady]=useState(false),[error,setError]=useState(""),[syncKey,setSyncKeyState]=useState(""),[syncStatus,setSyncStatus]=useState<"idle"|"syncing"|"synced"|"error">("idle");
 const syncKeyRef=useRef("");
 useEffect(()=>{let active=true;const localSync=()=>{setState(read());setReady(true);};localSync();window.addEventListener(EVENT,localSync);window.addEventListener("storage",localSync);
  const key=ensureSyncKey();syncKeyRef.current=key;setSyncKeyState(key);if(key){setSyncStatus("syncing");pullRemote(key).then(remote=>{if(!active)return;if(remote){write(remote);setState(remote);window.dispatchEvent(new Event(EVENT));}else queuePush(key,read());setSyncStatus("synced");}).catch(()=>{if(active)setSyncStatus("error");});}
  return()=>{active=false;window.removeEventListener(EVENT,localSync);window.removeEventListener("storage",localSync);};
 },[]);
 const update=useCallback((change:(s:ClientWatchState)=>ClientWatchState)=>{try{const before=read(),next=change(before);if(next===before)return;write(next);setState(next);setError("");window.dispatchEvent(new Event(EVENT));queuePush(syncKeyRef.current,next);}catch{setError("Browser storage unavailable; changes could not be saved.");}},[]);
 const toggle=useCallback((token:WatchToken)=>update(s=>{const removing=s.entries.some(e=>e.mint===token.mint);if(!removing)return {...s,entries:[...s.entries,{mint:token.mint,symbol:token.symbol,name:token.name,rules:{}}].slice(0,50)};const smartRules={...s.smartRules};delete smartRules[token.mint];return {...s,entries:s.entries.filter(e=>e.mint!==token.mint),alerts:s.alerts.filter(a=>a.mint!==token.mint),smartAlerts:s.smartAlerts.filter(a=>a.mint!==token.mint),smartRules,seen:Object.fromEntries(Object.entries(s.seen).filter(([k])=>!k.startsWith(token.mint+":"))),active:Object.fromEntries(Object.entries(s.active).filter(([k])=>!k.startsWith(token.mint+":"))),smartSeen:Object.fromEntries(Object.entries(s.smartSeen).filter(([k])=>!k.startsWith(token.mint+":"))),smartActive:Object.fromEntries(Object.entries(s.smartActive).filter(([k])=>!k.startsWith(token.mint+":")))};}),[update]);
 const evaluate=useCallback((tokens:WatchToken[])=>update(s=>{const base=evaluatePersonalAlerts(s,tokens),smart=evaluateSmartPersonalAlerts(s,tokens);if(base===s&&smart===s)return s;return {...base,smartRules:smart.smartRules,smartAlerts:smart.smartAlerts,smartSeen:smart.smartSeen,smartActive:smart.smartActive};}),[update]);
 const replaceSyncKey=useCallback(async(raw:string)=>{const key=raw.trim().toLowerCase();if(!SYNC_RE.test(key)){setSyncStatus("error");return false;}try{localStorage.setItem(SYNC_KEY,key);syncKeyRef.current=key;setSyncKeyState(key);setSyncStatus("syncing");const remote=await pullRemote(key);if(remote){write(remote);setState(remote);window.dispatchEvent(new Event(EVENT));}else{const local=read();await pushRemote(key,local);}setSyncStatus("synced");setError("");return true;}catch{setSyncStatus("error");return false;}},[]);
 const syncNow=useCallback(async()=>{const key=syncKeyRef.current;if(!key)return;setSyncStatus("syncing");try{const remote=await pullRemote(key);if(remote){write(remote);setState(remote);window.dispatchEvent(new Event(EVENT));}else await pushRemote(key,read());setSyncStatus("synced");}catch{setSyncStatus("error");}},[]);
 return {state,ready,error,update,toggle,evaluate,syncKey,syncStatus,replaceSyncKey,syncNow};
}
