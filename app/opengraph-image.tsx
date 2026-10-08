import {ImageResponse} from "next/og";

export const runtime="edge";
export const alt="SolanaBubble · Live Solana Market Intelligence";
export const size={width:1200,height:630};
export const contentType="image/png";

export default function Image(){
 return new ImageResponse(
  <div style={{width:"100%",height:"100%",display:"flex",position:"relative",overflow:"hidden",background:"#0b0f14",color:"#eef7f2",fontFamily:"Arial"}}>
   <div style={{position:"absolute",inset:0,background:"radial-gradient(circle at 22% 45%, rgba(70,230,155,.18), transparent 34%), radial-gradient(circle at 80% 36%, rgba(105,151,255,.12), transparent 32%)"}}/>
   <div style={{display:"flex",flexDirection:"column",justifyContent:"center",padding:"76px 84px",zIndex:2,width:"100%"}}>
    <div style={{display:"flex",alignItems:"center",gap:22}}>
     <div style={{width:88,height:88,borderRadius:44,border:"5px solid #65e7a5",background:"#123126",boxShadow:"0 0 36px rgba(80,230,160,.35)"}}/>
     <div style={{fontSize:28,letterSpacing:7,color:"#77e8aa"}}>SOLANABUBBLE</div>
    </div>
    <div style={{fontSize:68,fontWeight:800,letterSpacing:-3,marginTop:34,maxWidth:980}}>Live Solana market intelligence that shows what is moving — and whether the setup is actually constructive.</div>
    <div style={{fontSize:28,color:"#9eabb4",marginTop:30}}>GOOD Opportunity · Hype direction · real BUY/SELL evidence · holder intelligence</div>
    <div style={{display:"flex",gap:16,marginTop:42}}>
     {["Opportunity","Confidence","Capital Flow","Risk"].map((x,i)=><div key={x} style={{display:"flex",padding:"11px 18px",border:"1px solid #34434b",borderRadius:9,color:i===3?"#f2ca79":"#d9e4df",fontSize:20}}>{x}</div>)}
    </div>
   </div>
  </div>,
  size
 );
}
