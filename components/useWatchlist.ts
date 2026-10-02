"use client";
import {useEffect,useState,useCallback} from 'react';
import {emptyWatchState,normalizeWatchState,evaluatePersonalAlerts,type WatchState,type WatchToken} from '@/lib/watchlist';
const KEY='solanabubble:watchlist:v1',EVENT='solanabubble:watchlist-change';
function read(){try{return normalizeWatchState(JSON.parse(localStorage.getItem(KEY)??localStorage.getItem('solanabubble:wishlist')??'null'));}catch{return emptyWatchState();}}
export function useWatchlist(){
  const [state,setState]=useState(emptyWatchState);const [ready,setReady]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{const sync=()=>{setState(read());setReady(true);};sync();window.addEventListener(EVENT,sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener(EVENT,sync);window.removeEventListener('storage',sync);};},[]);
  const update=useCallback((change:(s:WatchState)=>WatchState)=>{try{const before=read(),next=change(before);if(next===before)return;localStorage.setItem(KEY,JSON.stringify(next));setState(next);setError('');window.dispatchEvent(new Event(EVENT));}catch{setError('Browser storage unavailable; changes could not be saved.');}},[]);
  const toggle=useCallback((token:WatchToken)=>update(s=>({...s,entries:s.entries.some(e=>e.mint===token.mint)?s.entries.filter(e=>e.mint!==token.mint):[...s.entries,{mint:token.mint,symbol:token.symbol,name:token.name,rules:{}}].slice(0,50),seen:Object.fromEntries(Object.entries(s.seen).filter(([k])=>!k.startsWith(`${token.mint}:`))),active:Object.fromEntries(Object.entries(s.active).filter(([k])=>!k.startsWith(`${token.mint}:`)))})),[update]);
  const evaluate=useCallback((tokens:WatchToken[])=>update(s=>evaluatePersonalAlerts(s,tokens)),[update]);
  return {state,ready,error,update,toggle,evaluate};
}
