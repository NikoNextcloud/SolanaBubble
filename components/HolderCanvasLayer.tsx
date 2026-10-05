"use client";
import {useEffect,useRef} from "react";

type NodeLike={wallet:string;x:number;y:number;r:number;usd_value:number;pct_supply:number;flash?:string};
type LinkLike={source:string;target:string;kind:string;group?:number;signalCount?:number};
const palette=["#ff6f91","#e56bd0","#8b7cff","#55c2ff","#58d6a7","#ffb45e","#ff6473","#60d4df"];
const groupColor=(id:number)=>palette[Math.abs(id)%palette.length];
const usd=(n:number)=>n>=1e6?`$${(n/1e6).toFixed(1)}M`:n>=1e3?`$${(n/1e3).toFixed(0)}k`:`$${n.toFixed(0)}`;

export default function HolderCanvasLayer({
 width,height,nodes,links,groups,transform,selected,focused,
}:{width:number;height:number;nodes:NodeLike[];links:LinkLike[];groups:Map<string,number>;transform:{x:number;y:number;k:number};selected:string|null;focused:Set<string>}){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const canvas=ref.current;if(!canvas||width<=0||height<=0)return;
  const dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;
  const ctx=canvas.getContext("2d",{alpha:true});if(!ctx)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  ctx.save();ctx.translate(transform.x,transform.y);ctx.scale(transform.k,transform.k);
  const byWallet=new Map(nodes.map(n=>[n.wallet,n]));

  ctx.lineCap="round";
  for(const link of links){
    const a=byWallet.get(link.source),b=byWallet.get(link.target);if(!a||!b)continue;
    const dim=selected&&!focused.has(a.wallet)&&!focused.has(b.wallet);
    const gid=groups.get(a.wallet)??groups.get(b.wallet)??link.group;
    const directed=link.kind.startsWith("flow-")||link.kind==="direct-transfer";
    ctx.globalAlpha=dim?.07:(directed?.46:.28);
    ctx.strokeStyle=gid?groupColor(gid):directed?"#9bb5d3":"#626b77";
    ctx.lineWidth=directed?1.35:1;
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d;
    ctx.beginPath();ctx.moveTo(a.x+ux*(a.r+3),a.y+uy*(a.r+3));ctx.lineTo(b.x-ux*(b.r+3),b.y-uy*(b.r+3));ctx.stroke();
  }

  ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="9px ui-monospace, monospace";
  for(const n of nodes){
    const gid=groups.get(n.wallet),color=gid?groupColor(gid):"#69717f";
    const dim=selected&&!focused.has(n.wallet);
    ctx.globalAlpha=dim?.13:1;
    ctx.beginPath();ctx.arc(n.x,n.y,n.r,0,Math.PI*2);
    ctx.fillStyle=n.flash==="buy"?"rgba(223,229,237,.72)":n.flash==="sell"?"rgba(53,32,38,.56)":gid?`${color}33`:"rgba(23,26,33,.7)";
    ctx.fill();
    ctx.strokeStyle=selected===n.wallet?"#f4f7fb":color;ctx.lineWidth=selected===n.wallet?3:gid?2.1:1.3;ctx.stroke();
    if(n.r>=12){
      ctx.globalAlpha=dim?.12:.9;ctx.fillStyle="#e6eaf0";ctx.fillText(usd(Number(n.usd_value||0)),n.x,n.y);
    }
  }
  ctx.restore();ctx.globalAlpha=1;
 },[width,height,nodes,links,groups,transform,selected,focused]);
 return <canvas ref={ref} className="holder-map-canvas" aria-hidden="true"/>;
}
