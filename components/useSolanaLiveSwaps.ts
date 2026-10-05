"use client";

import {useEffect,useRef,useState} from "react";
import {decodeDirectSwap,decodeRoutedSwap} from "@/lib/market/traffic/decode";
import type {LiveMarketEvent} from "@/lib/market/live-events";

export type LivePoolTarget={mint:string;pool:string};

const WS_URL=process.env.NEXT_PUBLIC_SOLANA_WS_URL||"wss://api.mainnet-beta.solana.com";
const HTTP_URL=process.env.NEXT_PUBLIC_SOLANA_RPC_URL||"https://api.mainnet-beta.solana.com";
const MAX_PER_MINUTE=18;

export function useSolanaLiveSwaps(targets:LivePoolTarget[],enabled=true){
  const [events,setEvents]=useState<LiveMarketEvent[]>([]);
  const [status,setStatus]=useState<"off"|"connecting"|"live"|"degraded">("off");
  const seen=useRef(new Set<string>());
  const key=targets.map(t=>`${t.mint}:${t.pool}`).sort().join("|");

  useEffect(()=>{
    if(!enabled||!targets.length){setStatus("off");return;}
    let closed=false;
    let ws:WebSocket|null=null;
    let retry=0;
    let reconnectTimer=0;
    const requestTargets=new Map<number,LivePoolTarget>();
    const subscriptions=new Map<number,LivePoolTarget>();
    const recentRequests:number[]=[];
    const queue:{signature:string;target:LivePoolTarget}[]=[];
    let processing=false;

    const add=(row:LiveMarketEvent)=>{
      const id=`${row.mint}:${row.signature}:${row.wallet}`;
      if(seen.current.has(id))return;
      seen.current.add(id);
      setEvents(current=>[row,...current].slice(0,60));
    };

    const processQueue=async()=>{
      if(processing||closed)return;
      processing=true;
      while(queue.length&&!closed){
        const now=Date.now();
        while(recentRequests.length&&now-recentRequests[0]>60_000)recentRequests.shift();
        if(recentRequests.length>=MAX_PER_MINUTE){await new Promise(r=>setTimeout(r,1500));continue;}
        const item=queue.shift()!;
        if(seen.current.has(`${item.target.mint}:${item.signature}:pending`))continue;
        seen.current.add(`${item.target.mint}:${item.signature}:pending`);
        recentRequests.push(Date.now());
        try{
          const response=await fetch(HTTP_URL,{
            method:"POST",
            headers:{"content-type":"application/json"},
            body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getTransaction",params:[item.signature,{encoding:"jsonParsed",maxSupportedTransactionVersion:1,commitment:"confirmed"}]}),
          });
          const json=await response.json();
          const tx=json?.result;
          const swap=decodeDirectSwap(tx,item.target.mint,item.target.pool,null)??decodeRoutedSwap(tx,item.target.mint,item.target.pool,null);
          if(swap){
            add({
              mint:item.target.mint,signature:swap.signature,wallet:swap.wallet,pool:swap.pool,side:swap.side,
              usd_value:swap.usd_value,quote_mint:swap.quote_mint,quote_amount:swap.quote_amount,
              evidence:swap.evidence??"direct",program:swap.program,block_at:swap.block_at,
              whale:false,wallet_pct_supply:null,observed_at:new Date().toISOString(),
            });
          }
        }catch{}
        await new Promise(r=>setTimeout(r,280));
      }
      processing=false;
    };

    const connect=()=>{
      if(closed)return;
      setStatus(retry?"degraded":"connecting");
      try{ws=new WebSocket(WS_URL);}catch{scheduleReconnect();return;}
      ws.onopen=()=>{
        retry=0;setStatus("live");
        targets.slice(0,4).forEach((target,index)=>{
          const id=index+1;requestTargets.set(id,target);
          ws?.send(JSON.stringify({jsonrpc:"2.0",id,method:"logsSubscribe",params:[{mentions:[target.pool]},{commitment:"confirmed"}]}));
        });
      };
      ws.onmessage=(message)=>{
        try{
          const payload=JSON.parse(String(message.data));
          if(typeof payload.id==="number"&&typeof payload.result==="number"){
            const target=requestTargets.get(payload.id);if(target)subscriptions.set(payload.result,target);
            return;
          }
          if(payload.method!=="logsNotification")return;
          const subscription=Number(payload.params?.subscription);
          const target=subscriptions.get(subscription);
          const signature=String(payload.params?.result?.value?.signature??"");
          const err=payload.params?.result?.value?.err;
          if(!target||!signature||err)return;
          const pendingKey=`${target.mint}:${signature}:queued`;
          if(seen.current.has(pendingKey))return;
          seen.current.add(pendingKey);
          queue.push({signature,target});
          if(queue.length>24)queue.splice(0,queue.length-24);
          void processQueue();
        }catch{}
      };
      ws.onerror=()=>setStatus("degraded");
      ws.onclose=()=>scheduleReconnect();
    };
    const scheduleReconnect=()=>{
      if(closed)return;
      setStatus("degraded");retry++;
      window.clearTimeout(reconnectTimer);
      reconnectTimer=window.setTimeout(connect,Math.min(15_000,1000*2**Math.min(4,retry)));
    };
    connect();

    return()=>{
      closed=true;window.clearTimeout(reconnectTimer);
      try{ws?.close();}catch{}
    };
  },[enabled,key]);

  return {events,status};
}
