import {livingWavePath, type LivingWaveDynamics} from './wave-map';

export type MotionWave = {
  key:string; x1:number; y1:number; x2:number; y2:number;
  dynamics:LivingWaveDynamics; phase:number;
};
export type MotionClock = {seconds:number};
export type MotionOptions = {running:boolean; gentle?:boolean; clock?:MotionClock};

// This changes geometry continuously, not just the dash pattern. Endpoints stay
// anchored to the token and measured flow value. Motion is NOT a trade signal.
export function continuousWaveFrame(wave:MotionWave,seconds:number,gentle=false){
  const span=Math.abs(wave.x2-wave.x1);
  const dynamics={...wave.dynamics,
    amplitude:Math.min(Math.max(11,wave.dynamics.amplitude),Math.max(6,span*.14))*(gentle?.35:1),
    frequency:Math.min(wave.dynamics.frequency,Math.max(2,span/58)),
  };
  const period=Math.max(1.8,wave.dynamics.duration*1.8);
  const phase=wave.phase-seconds*Math.PI*2/period*(gentle?.32:1);
  return livingWavePath(wave.x1,wave.y1,wave.x2,wave.y2,dynamics,phase);
}

// One bounded requestAnimationFrame loop per mounted map. No React re-render per
// frame, no reliance on SMIL, and no provider polling in the drawing loop.
export function startContinuousWaves(svg:SVGSVGElement,waves:readonly MotionWave[],options:MotionOptions){
  const doc=svg.ownerDocument,win=doc.defaultView;
  if(!win)return ()=>{};
  const clock=options.clock??{seconds:0};
  const groups=new Map(Array.from(svg.querySelectorAll<SVGGElement>('[data-motion-key]'))
    .map(el=>[el.dataset.motionKey,el]));
  const entries=waves.map(wave=>{
    const group=groups.get(wave.key);
    const primary=group?.querySelector<SVGPathElement>('.living-wave-path, .early-living-wave');
    if(!group||!primary||![wave.x1,wave.y1,wave.x2,wave.y2,wave.dynamics.amplitude,wave.dynamics.frequency,wave.dynamics.duration].every(Number.isFinite))return null;
    return {wave,primary,paths:Array.from(group.querySelectorAll<SVGPathElement>('path')),
      drift:Array.from(group.querySelectorAll<SVGPathElement>('.living-wave-path, .early-living-wave, .opportunity-wave-path'))};
  }).filter((entry):entry is NonNullable<typeof entry>=>entry!==null);
  const byKey=new Map(entries.map(entry=>[entry.wave.key,entry]));
  const dots=Array.from(svg.querySelectorAll<SVGCircleElement>('[data-follow-wave]')).slice(0,160);
  let raf:number|null=null,last:number|null=null,drawnAt=0,disposed=false,frame=Number(svg.dataset.motionFrame)||0;
  const interval=1000/30;
  const draw=()=>{
    for(const {wave,paths,drift} of entries){
      const d=continuousWaveFrame(wave,clock.seconds,options.gentle);
      for(const path of paths)path.setAttribute('d',d);
      for(const path of drift)path.style.strokeDashoffset=String(-clock.seconds*42/Math.max(.7,wave.dynamics.duration)*(options.gentle?.4:1));
    }
    const wallNow=Date.now(),lengths=new Map<string,number>();
    for(const dot of dots){
      const entry=byKey.get(dot.dataset.followWave??'');
      if(!entry)continue;
      const duration=Math.max(.5,Number(dot.dataset.travelSec)||3);
      const offset=Number(dot.dataset.progress)||0;
      const observed=Number(dot.dataset.observedAt);
      let progress:number;
      if(Number.isFinite(observed)&&observed>0){
        const age=wallNow-observed;
        dot.style.visibility=age<0||age>=4200?'hidden':'visible';
        progress=Math.max(0,Math.min(1,age/(duration*1000)));
      }else progress=(clock.seconds/duration*(options.gentle?.35:1)+offset)%1;
      let length=lengths.get(entry.wave.key);
      if(length===undefined){length=entry.primary.getTotalLength();lengths.set(entry.wave.key,length);}
      const point=entry.primary.getPointAtLength(length*progress);
      dot.setAttribute('cx',point.x.toFixed(2));dot.setAttribute('cy',point.y.toFixed(2));
    }
    svg.dataset.motionFrame=String(++frame);
  };
  const stop=()=>{if(raf!==null)win.cancelAnimationFrame(raf);raf=null;last=null;};
  const tick=(time:number)=>{
    raf=null;
    if(disposed||doc.hidden||!options.running)return;
    const delta=last===null?0:Math.min(.1,Math.max(0,(time-last)/1000));
    last=time;clock.seconds+=delta;
    if(time-drawnAt>=interval){drawnAt=time;draw();}
    raf=win.requestAnimationFrame(tick);
  };
  const sync=()=>{
    stop();
    svg.dataset.motionState=!options.running?'paused':doc.hidden?'background':entries.length?'running':'waiting';
    if(options.running&&!doc.hidden&&entries.length)raf=win.requestAnimationFrame(tick);
  };
  svg.dataset.motionEngine='raf-v2';
  svg.dataset.motionStyle=options.gentle?'gentle':'live';
  draw();sync();
  doc.addEventListener('visibilitychange',sync);
  win.addEventListener('pageshow',sync);
  win.addEventListener('pagehide',stop);
  return ()=>{disposed=true;stop();doc.removeEventListener('visibilitychange',sync);win.removeEventListener('pageshow',sync);win.removeEventListener('pagehide',stop);};
}
