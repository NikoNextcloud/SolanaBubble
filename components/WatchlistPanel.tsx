"use client";
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useWatchlist} from './useWatchlist';
import {validMint,ruleDefinitions,smartRuleDefinitions,matchesWatchFilters,type WatchToken,type RuleKey,type SmartRuleKey} from '@/lib/watchlist';
import DataQuality from './DataQuality';
import FavoriteButton from './FavoriteButton';
import SavedMarketFilters from './SavedMarketFilters';
import PushNotifications from './PushNotifications';
export default function WatchlistPanel(){
  const router=useRouter();const {state,ready,error,update,toggle,evaluate,syncKey,syncStatus,replaceSyncKey,syncNow}=useWatchlist();
  const [tokens,setTokens]=useState<WatchToken[]>([]),[mint,setMint]=useState(''),[status,setStatus]=useState(''),[loading,setLoading]=useState(false),[syncInput,setSyncInput]=useState('');
  const mints=state.entries.map(e=>e.mint).sort().join(',');
  useEffect(()=>{if(!ready)return;if(!mints){setTokens([]);return;}const controller=new AbortController();
    const load=async()=>{if(document.hidden)return;setLoading(true);try{const r=await fetch(`/api/market/watchlist?mints=${encodeURIComponent(mints)}`,{signal:controller.signal,cache:'no-store'});if(!r.ok)throw new Error();const j=await r.json();if(controller.signal.aborted)return;setTokens(j.tokens??[]);evaluate(j.tokens??[]);setStatus('');}catch{if(!controller.signal.aborted)setStatus('Update unavailable; previous observations are shown with their timestamps.');}finally{if(!controller.signal.aborted)setLoading(false);}};
    load();const timer=setInterval(load,120000);document.addEventListener('visibilitychange',load);return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',load);};
  },[mints,ready,evaluate]);
  const setRule=(mint:string,key:RuleKey,value:number|undefined)=>update(s=>({...s,entries:s.entries.map(e=>e.mint===mint?{...e,rules:{...e.rules,[key]:value}}:e),active:{...s.active,[`${mint}:${key}`]:false},seen:{...s.seen,[`${mint}:${key}`]:''}}));
  const setSmartRule=(mint:string,key:SmartRuleKey,enabled:boolean)=>update(s=>({...s,entries:s.entries.map(e=>e.mint===mint?{...e,smartRules:{...e.smartRules,[key]:enabled}}:e),active:{...s.active,[`${mint}:${key}`]:false},seen:{...s.seen,[`${mint}:${key}`]:''}}));
  const personalAlerts=state.alerts.filter(a=>state.entries.some(e=>e.mint===a.mint));
  const shown=state.entries.map(e=>({entry:e,token:tokens.find(t=>t.mint===e.mint)??{mint:e.mint,symbol:e.symbol,name:e.name}})).filter(({token})=>matchesWatchFilters(token,state.filters,state.entries));
  return <div className="watchlist-panel"><p className="signal-note">Favorites, rules and filters are saved locally and can sync between devices with your private sync key. Keep the key secret: anyone with it can access this watchlist.</p>
    <details className="watchlist-sync"><summary>Sync between devices · {syncStatus==='syncing'?'Syncing…':syncStatus==='error'?'Needs attention':'Ready'}</summary>
      <div className="watchlist-sync-grid">
        <label>Your private sync key<input value={syncKey} readOnly onFocus={e=>e.currentTarget.select()}/></label>
        <div className="watchlist-sync-actions"><button type="button" onClick={()=>navigator.clipboard?.writeText(syncKey)}>Copy key</button><button type="button" onClick={()=>syncNow()}>Sync now</button></div>
        <label>Use an existing key<input value={syncInput} onChange={e=>setSyncInput(e.target.value)} placeholder="Paste 64-character sync key"/></label>
        <button type="button" onClick={async()=>{if(await replaceSyncKey(syncInput)){setSyncInput('');setStatus('Watchlist synced from the selected key.');}else setStatus('Invalid sync key or sync service unavailable.');}}>Use this key</button>
      </div>
    </details>
    <PushNotifications syncKey={syncKey}/>
    <form className="watchlist-add" onSubmit={e=>{e.preventDefault();if(!validMint(mint.trim())){setStatus('Enter a valid Solana token mint.');return;}if(state.entries.some(t=>t.mint===mint.trim())){setStatus('Token already saved.');return;}toggle({mint:mint.trim()});setMint('');setStatus('');}}><label>Token mint <input value={mint} onChange={e=>setMint(e.target.value)} placeholder="Paste mint address"/></label><button disabled={!ready||state.entries.length>=50}>Add favorite</button><span>{state.entries.length}/50 {loading?'· Updating…':''}</span></form>
    <SavedMarketFilters/>{(error||status)&&<p role="status">{error||status}</p>}
    {!state.entries.length&&<p className="market-section-empty">Add a mint here or use ☆ Add to Watchlist in any Token Signal Card.</p>}
    {!!state.entries.length&&!shown.length&&<p>No favorites match the saved filters.</p>}
    <div className="market-section-grid">{shown.map(({entry,token})=><article className="market-section-card static" key={entry.mint}><button className="watchlist-open" onClick={()=>router.push(`/token/${entry.mint}`)}><strong>{token.symbol||token.name||entry.mint.slice(0,8)}</strong><small>{entry.mint}</small></button><FavoriteButton token={token}/><p>Hype {token.hypeScore??'—'} · Risk {token.riskScore??'—'} · Price {token.priceUsd!=null?`$${token.priceUsd.toLocaleString(undefined,{maximumSignificantDigits:5})}`:'—'}</p>
      <details className="watchlist-rules"><summary>Personal alerts</summary>{smartRuleDefinitions.map(d=><label key={d.key}><input type="checkbox" checked={entry.smartRules?.[d.key]===true} onChange={e=>setSmartRule(entry.mint,d.key,e.target.checked)}/>{d.label}</label>)}<hr/>{ruleDefinitions.map(d=><label key={d.key}><input type="checkbox" checked={entry.rules[d.key]!=null} onChange={e=>setRule(entry.mint,d.key,e.target.checked?d.default:undefined)}/>{d.label}<input aria-label={`${token.symbol??entry.mint} ${d.label}`} type="number" min={d.min} max={d.max} step="any" disabled={entry.rules[d.key]==null} value={entry.rules[d.key]??d.default} onChange={e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>=d.min&&v<=d.max)setRule(entry.mint,d.key,v);}}/></label>)}<small>Smart rules use fresh Signal Engine evidence and rearm after the condition clears. Numeric thresholds remain available for fine tuning.</small></details><DataQuality token={token}/></article>)}</div>
    <section className="reference-side-card"><div className="market-hot-title"><strong>Personal alerts</strong><button onClick={()=>update(s=>({...s,alerts:[]}))}>Clear history</button></div>{personalAlerts.slice(0,30).map(a=>{const numeric=ruleDefinitions.find(d=>d.key===a.key),smart=smartRuleDefinitions.find(d=>d.key===a.key);return <button className="personal-alert" key={a.id} onClick={()=>router.push(`/token/${a.mint}`)}><strong>{a.symbol??a.mint.slice(0,6)}</strong> · {smart?.label??numeric?.label??a.key}{numeric?` ${a.threshold} · observed ${a.value.toFixed(2)}`:""}<small>{a.message?`${a.message} · `:""}{new Date(a.at).toLocaleString()}</small></button>})}{!personalAlerts.length&&<p className="signal-note">No personal threshold crossings yet.</p>}</section>
  </div>;
}
