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
      // The old impulses-only flag could silently freeze the whole map.
      // Migrate that obsolete control to Auto; retain new explicit Pause choices.
    }catch{}
    return ()=>media.removeEventListener('change',sync);
  },[]);
  const setMode=(value:WaveMotionMode)=>{
    if(!['auto','live','off'].includes(value))return;
    setModeState(value);
    try{localStorage.setItem(KEY,value);}catch{}
  };
  // Auto reduces speed/amplitude when requested by the OS. A direct user choice
  // can enable full movement; Pause stops the renderer completely.
  return {mode,setMode,reduced,enabled:mode!=='off',gentle:mode==='auto'&&reduced};
}
