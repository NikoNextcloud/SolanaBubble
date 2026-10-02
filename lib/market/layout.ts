export type SpacedNode = {x:number;y:number;r:number;fx?:number|null;fy?:number|null};
/** Resolve residual collisions after forces; deliberately pinned nodes keep their positions. */
export function separateMapNodes(nodes:SpacedNode[], gap=40,iterations=4) {
  for(let pass=0;pass<iterations;pass++) for(let i=0;i<nodes.length;i++) for(let j=i+1;j<nodes.length;j++) {
    const a=nodes[i],b=nodes[j],fixedA=a.fx!=null&&a.fy!=null,fixedB=b.fx!=null&&b.fy!=null;
    if(fixedA&&fixedB) continue;
    let dx=b.x-a.x,dy=b.y-a.y;
    let distance=Math.hypot(dx,dy);const minimum=a.r+b.r+gap;
    if(distance>=minimum) continue;
    if(distance<.001) {const angle=(i*2.399963+j)*1.7;dx=Math.cos(angle);dy=Math.sin(angle);distance=1;}
    const shift=minimum-distance, ux=dx/distance,uy=dy/distance;
    const shareA=fixedA?0:fixedB?1:.5,shareB=fixedB?0:fixedA?1:.5;
    a.x-=ux*shift*shareA;a.y-=uy*shift*shareA;b.x+=ux*shift*shareB;b.y+=uy*shift*shareB;
  }
}
