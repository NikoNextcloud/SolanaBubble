/// <reference lib="webworker" />
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";

type WorkerNode = {
  wallet:string;
  x:number;y:number;vx?:number;vy?:number;fx?:number|null;fy?:number|null;r:number;
  group?:number|null;
};
type WorkerLink={source:string;target:string;kind:string};
let width=900,height=600,paused=false;
const nodes=new Map<string,WorkerNode>();
let links:WorkerLink[]=[];
const simulation=forceSimulation<WorkerNode>().alphaDecay(.026).velocityDecay(.34).stop();
let lastPost=0;

function configure(){
 const groups=[...new Set([...nodes.values()].map(n=>n.group).filter((g):g is number=>g!=null))].sort((a,b)=>a-b);
 const centers=new Map<number,{x:number;y:number}>();
 groups.forEach((id,i)=>{
  if(groups.length===1){centers.set(id,{x:width*.52,y:height*.5});return;}
  const angle=-Math.PI/2+(i/groups.length)*Math.PI*2;
  centers.set(id,{x:width/2+Math.cos(angle)*width*.29,y:height/2+Math.sin(angle)*height*.27});
 });
 simulation.nodes([...nodes.values()]);
 simulation.force("center",forceCenter(width/2,height/2).strength(.025));
 simulation.force("charge",forceManyBody<WorkerNode>().strength(d=>d.group!=null?-10:-34));
 simulation.force("x",forceX<WorkerNode>(d=>d.group!=null?(centers.get(d.group)?.x??width/2):width/2).strength(d=>d.group != null ? .2 : .014));
 simulation.force("y",forceY<WorkerNode>(d=>d.group!=null?(centers.get(d.group)?.y??height/2):height/2).strength(d=>d.group != null ? .2 : .014));
 simulation.force("collide",forceCollide<WorkerNode>(d=>d.r+(d.group!=null?7:11)).strength(.97));
 simulation.force("link",forceLink<WorkerNode,any>(links).id(d=>d.wallet)
   .distance((l:any)=>l.kind==="funder"?46:l.kind==="direct-transfer"?50:l.kind==="timing"?58:String(l.kind).startsWith("flow-")?68:60)
   .strength((l:any)=>l.kind==="funder"?.48:l.kind==="direct-transfer"?.42:l.kind==="timing"?.28:String(l.kind).startsWith("flow-")?.22:.16));
}
function postPositions(force=false){
 const now=performance.now();if(!force&&now-lastPost<32)return;lastPost=now;
 postMessage({type:"tick",alpha:simulation.alpha(),nodes:[...nodes.values()].map(n=>({wallet:n.wallet,x:n.x,y:n.y,vx:n.vx??0,vy:n.vy??0,fx:n.fx??null,fy:n.fy??null}))});
}
simulation.on("tick",()=>postPositions(false)).on("end",()=>postPositions(true));

function restart(alpha=.62){
 configure();
 if(paused){simulation.stop();postPositions(true);return;}
 simulation.alpha(Math.max(alpha,simulation.alpha())).alphaTarget(0).restart();
}
self.onmessage=(event:MessageEvent)=>{
 const msg=event.data??{};
 if(msg.type==="sync"){
  width=Math.max(1,Number(msg.width)||900);height=Math.max(1,Number(msg.height)||600);
  links=Array.isArray(msg.links)?msg.links:[];
  const incoming=Array.isArray(msg.nodes)?msg.nodes:[];
  const incomingWallets=new Set<string>();
  for(const raw of incoming){
   incomingWallets.add(raw.wallet);
   const current=nodes.get(raw.wallet);
   if(current)Object.assign(current,raw);
   else nodes.set(raw.wallet,{...raw});
  }
  for(const wallet of [...nodes.keys()])if(!incomingWallets.has(wallet))nodes.delete(wallet);
  restart(Number(msg.alpha)||.62);
 }else if(msg.type==="resize"){
  width=Math.max(1,Number(msg.width)||width);height=Math.max(1,Number(msg.height)||height);restart(.42);
 }else if(msg.type==="drag"){
  const n=nodes.get(msg.wallet);if(!n)return;
  n.x=Number(msg.x);n.y=Number(msg.y);n.fx=n.x;n.fy=n.y;n.vx=0;n.vy=0;
  restart(.78);simulation.alphaTarget(.2);
 }else if(msg.type==="pin"){
  const n=nodes.get(msg.wallet);if(!n)return;
  n.fx=Number(msg.x);n.fy=Number(msg.y);n.x=n.fx;n.y=n.fy;n.vx=0;n.vy=0;restart(.5);
 }else if(msg.type==="releaseAll"){
  for(const n of nodes.values()){n.fx=null;n.fy=null;}restart(.65);
 }else if(msg.type==="pause"){
  paused=true;simulation.stop();
 }else if(msg.type==="resume"){
  paused=false;restart(.18);
 }
};
