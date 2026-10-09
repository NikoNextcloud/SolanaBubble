"use client";
import {useEffect,useState} from 'react';
export type WaveMotionMode='auto'|'live'|'off';
const KEY='solanabubble:wave-motion:v2';
export function useWaveMotionPreference(){
  const [mode,setModeState]=useState<WaveMotionMode>('auto');
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync=()=>setReduced(media.matches);sync();
    media.addEventListener('change',sync);
    try{
      const stored=localStorage.getItem(KEY);
      if(stored==='auto'||stored==='live'||stored==='off')setModeState(stored);
      else if(localStorage.getItem('solanabubble:map-pulses')==='off')setModeState('off');
    }catch{}
    return ()=>media.removeEventListener('change',sync);
  },[]);
  const setMode=(value:WaveMotionMode)=>{
    if(!['auto','live','off'].includes(value))return;
    setModeState(value);
    try{localStorage.setItem(KEY,value);localStorage.setItem('solanabubble:map-pulses',value==='off'?'off':'on');}catch{}
  };
  // Reduced motion uses slow, low-amplitude movement, not a misleading ON label
  // over a completely frozen map. A direct user choice can opt into full motion.
  return {mode,setMode,reduced,enabled:mode!=='off',gentle:mode==='auto'&&reduced};
}
