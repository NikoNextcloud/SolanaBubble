"use client";

import {useEffect,useRef,useState} from "react";
import {createClient,type RealtimeChannel} from "@supabase/supabase-js";
import type {LiveMarketEvent} from "@/lib/market/live-events";

const KEEP=80;
const recent=(event:LiveMarketEvent)=>Date.now()-Date.parse(event.block_at)<20*60_000;

export function useLiveMarketEvents(enabled=true){
  const [events,setEvents]=useState<LiveMarketEvent[]>([]);
  const [status,setStatus]=useState<"off"|"connecting"|"live"|"error">("off");
  const seen=useRef(new Set<string>());

  useEffect(()=>{
    if(!enabled){setStatus("off");return;}
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if(!url||!anon){setStatus("error");return;}

    let active=true;
    let channel:RealtimeChannel|null=null;
    const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{params:{eventsPerSecond:20}}});
    const push=(row:LiveMarketEvent)=>{
      if(!active||!row?.signature||!recent(row))return;
      const key=`${row.mint}:${row.signature}:${row.wallet}`;
      if(seen.current.has(key))return;
      seen.current.add(key);
      setEvents(current=>[row,...current.filter(item=>`${item.mint}:${item.signature}:${item.wallet}`!==key)].slice(0,KEEP));
    };

    setStatus("connecting");
    client.from("live_market_events")
      .select("*")
      .gte("block_at",new Date(Date.now()-20*60_000).toISOString())
      .order("block_at",{ascending:false})
      .limit(KEEP)
      .then(({data,error})=>{
        if(!active)return;
        if(error){setStatus("error");return;}
        const rows=(data??[]) as LiveMarketEvent[];
        for(const row of rows)seen.current.add(`${row.mint}:${row.signature}:${row.wallet}`);
        setEvents(rows.filter(recent));
      });

    channel=client.channel("market-capital-flow")
      .on("postgres_changes",{event:"*",schema:"public",table:"live_market_events"},payload=>{
        const row=(payload.new??payload.old) as LiveMarketEvent;
        push(row);
      })
      .subscribe(state=>{
        if(!active)return;
        if(state==="SUBSCRIBED")setStatus("live");
        else if(state==="CHANNEL_ERROR"||state==="TIMED_OUT")setStatus("error");
      });

    const trim=window.setInterval(()=>setEvents(current=>current.filter(recent)),30_000);
    return()=>{
      active=false;
      window.clearInterval(trim);
      if(channel)void client.removeChannel(channel);
    };
  },[enabled]);

  return {events,status};
}
