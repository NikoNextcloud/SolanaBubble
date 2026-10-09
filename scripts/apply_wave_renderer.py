from pathlib import Path
import re


def replace(s, old, new, count=1):
    found=s.count(old)
    if found != count:
        raise RuntimeError(f'Expected {count} matches, found {found}: {old[:110]}')
    return s.replace(old,new)

p=Path('components/MarketMap.tsx'); s=p.read_text()
s=replace(s,'import MarketWaveMap from "./MarketWaveMap";', 'import MarketWaveMap from "./MarketWaveMap";\nimport {useWaveMotionPreference,type WaveMotionMode} from "./useWaveMotionPreference";')
s=replace(s,'  const [pulsesEnabled,setPulsesEnabled]=useState(true);', '  const motion=useWaveMotionPreference();\n  const pulsesEnabled=motion.enabled;')
s=replace(s,'  const [reducedMotion,setReducedMotion]=useState(false);', '  const reducedMotion=motion.reduced;')
a=s.index('  useEffect(()=>{\n    try {setPulsesEnabled')
b=s.index('  // Rendering motion',a)
s=s[:a]+'''  useEffect(()=>{
    setSignalNow(Date.now());
    const timer=setInterval(()=>setSignalNow(Date.now()),30000);
    return()=>clearInterval(timer);
  },[]);
'''+s[b:]
s=replace(s,'const animateSignals=pulsesEnabled&&!reducedMotion;', 'const animateSignals=motion.enabled;')
s=re.sub(r'  function togglePulses\(\)\{[^\n]+\}\n','',s,count=1)
a=s.index('  useEffect(() => {\n    const activity = () => {')
b=s.index('  }, [streamLive, autoPaused]);',a)+len('  }, [streamLive, autoPaused]);')
s=s[:a]+'''  // Visibility already suspends provider hooks and polling. Watching the map
  // without touching it must not turn off live data after two minutes.
'''+s[b:]
pat=r'<button type="button" aria-pressed=\{pulsesEnabled\} onClick=\{togglePulses\}[^\n]+</button>'
new='''<label className="wave-motion-control"><span>Движение</span><select aria-label="Wave motion" value={motion.mode} onChange={e=>motion.setMode(e.target.value as WaveMotionMode)}><option value="auto">{motion.gentle?"Авто · спокойно":"Авто · живо"}</option><option value="live">Живо</option><option value="off">Пауза</option></select></label>'''
s,n=re.subn(pat,new,s); assert n==1,n
s=replace(s,'            animated={animateSignals}\n','            animated={animateSignals}\n            gentleMotion={motion.gentle}\n')
p.write_text(s)

p=Path('components/MarketWaveMap.tsx'); s=p.read_text()
s=replace(s,'import styles from "./MarketWaveMap.module.css";', 'import styles from "./MarketWaveMap.module.css";\nimport {startContinuousWaves,type MotionWave,type MotionClock} from "@/lib/market/continuous-wave-motion";')
s=replace(s,'animated,liveEnabled,maxComets,onSelect', 'animated,gentleMotion=false,liveEnabled,maxComets,onSelect')
s=replace(s,'animated:boolean;liveEnabled:boolean;', 'animated:boolean;gentleMotion?:boolean;liveEnabled:boolean;')
s=replace(s,'const safeWidth=Math.max(520,width||900),safeHeight=Math.max(420,height||560);', 'const safeWidth=Math.max(520,width||900),safeHeight=Math.max(420,height||560);\n const svgRef=useRef<SVGSVGElement>(null);\n const motionClock=useRef<MotionClock>({seconds:0});')
s=replace(s,'type Particle={id:string;', 'type Particle={observedAt:number;id:string;')
s=replace(s,'     id:event.mint+":"+event.signature+":"+event.wallet+":"+event.side,', '     observedAt:Date.parse(event.observed_at||event.block_at),\n     id:event.mint+":"+event.signature+":"+event.wallet+":"+event.side,')
s=replace(s,'     mint:point.mint,\n     side,', '     key:"good:"+point.mint,x1,y1:point.y,x2:scaleX,y2:point.endY,phase,\n     mint:point.mint,\n     side,')
s=replace(s,'return {pool,x:safeWidth-69,y,r:30,endY,pressure,activity,frames,d:frames[0],', 'return {key:"early:"+pool.id,x1:startX,y1:y,x2:endX,y2:endY,dynamics:activity,phase:index*.72,pool,x:safeWidth-69,y,r:30,endY,pressure,activity,frames,d:frames[0],')
a=s.index('\n return <div className={[styles.root,')
s=s[:a]+'''
 const motionWaves=useMemo<MotionWave[]>(()=>[...livingWaves,...earlyLayout],[livingWaves,earlyLayout]);
 useEffect(()=>{
   if(!svgRef.current)return;
   return startContinuousWaves(svgRef.current,motionWaves,{running:animated,gentle:gentleMotion,clock:motionClock.current});
 },[motionWaves,animated,gentleMotion,flowTrails,particles]);
 const earlyStale=earlyError||!liveEnabled||(earlyObservedAt!==null&&now-Date.parse(earlyObservedAt)>120000);
'''+s[a:]
s=replace(s,'  <svg className={"market-pan-surface "+styles.svg}', '  <svg ref={svgRef} data-motion-engine="raf-v2" className={"market-pan-surface "+styles.svg}')
s=replace(s,'className="living-wave-group" data-mint={wave.mint}', 'className="living-wave-group" data-motion-key={"good:"+wave.mint} data-mint={wave.mint}')
s=replace(s,'className="early-wave-group" data-pool={pool.id}', 'className="early-wave-group" data-motion-key={"early:"+pool.id} data-pool={pool.id}')
s,n=re.subn(r'\{animated&&<animate attributeName="d" [^>]+/>\}','',s); assert n==6,n
s=replace(s,'const trades=trail.slice(1);', 'const trades=trail.slice(1).slice(-Math.max(4,Math.floor(100/Math.max(1,layout.length))));')
s=replace(s,'return <circle key={"dot-"+trade.signature} r={radius}', 'return <circle key={"dot-"+trade.signature} r={radius} data-follow-wave={"good:"+wave.mint} data-travel-sec={travel} data-progress={index/Math.max(1,trades.length)}')
s=replace(s,'            {animated&&<animateMotion dur={travel+"s"} begin={begin+"s"} repeatCount="indefinite"><mpath href={"#living-wave-"+wave.mint}/></animateMotion>}', '')
s=replace(s,'{animated&&<circle r={opportunity.strength==="strong"?3.7:3} className={styles.opportunitySpark}><animateMotion dur={(3.2-opportunity.intensity*1.15)+"s"} repeatCount="indefinite"><mpath href={"#living-wave-"+wave.mint}/></animateMotion></circle>}', '{animated&&<circle r={opportunity.strength==="strong"?3.7:3} className={styles.opportunitySpark} data-follow-wave={"good:"+wave.mint} data-travel-sec={3.2-opportunity.intensity*1.15} data-progress="0.15"/>}')
s=replace(s,'<circle r={particle.whale?5.5:4.4} className={styles.eventDot+" targeted-comet-body"}>', '<circle r={particle.whale?5.5:4.4} className={styles.eventDot+" targeted-comet-body"} data-follow-wave={"good:"+particle.mint} data-observed-at={particle.observedAt} data-travel-sec={1.75+(index%3)*.14}>')
s=replace(s,'<animateMotion dur={(1.75+(index%3)*.14)+"s"} repeatCount="1" fill="remove" path={path}/>','')
s=replace(s,'<path d={path} className={[styles.eventWave,','<path d={path} data-follow-path={"good:"+particle.mint} className={[styles.eventWave,')
s=replace(s,'const uncertain=pressure===null||pool.stage==="insufficient-data";', 'const uncertain=earlyStale||pressure===null||pool.stage==="insufficient-data";')
s=replace(s,'const color=pool.stage==="liquidity-risk"?', 'const color=earlyStale?"#96a5af":pool.stage==="liquidity-risk"?')
s=replace(s,'data-coverage={earlyError?"degraded":"sampled"}', 'data-coverage={earlyStale?"degraded":earlyObservedAt?"sampled":"warming"}')
s=replace(s,'data-early-source={earlyError?"degraded":earlyObservedAt?"sampled":"warming"}', 'data-early-source={earlyStale?"degraded":earlyObservedAt?"sampled":"warming"}')
s=replace(s,'Math.min(150,p.liquidityUsd??0)/1000', 'Math.min(150,(p.liquidityUsd??0)/1000)')
s=replace(s,'const handleTokenClick=(token:MarketWaveToken)=>{onSelect(token);','const handleTokenClick=(token:MarketWaveToken)=>{setEarlySelected(null);onSelect(token);')
s=replace(s,'const handleTokenDoubleClick=(token:MarketWaveToken)=>{','const handleTokenDoubleClick=(token:MarketWaveToken)=>{setEarlySelected(null);')
p.write_text(s)

p=Path('components/MarketWaveMap.module.css'); s=p.read_text()
s+='''
/* The drawing loop owns geometry and dash phase; CSS/SMIL cannot override it. */
.svg[data-motion-engine="raf-v2"] .livingWave,.svg[data-motion-engine="raf-v2"] .earlyLivingWave,.svg[data-motion-engine="raf-v2"] .opportunityWave{animation:none!important;will-change:auto}
.svg[data-motion-state="background"] *,.paused *{animation-play-state:paused!important}
.svg[data-motion-style="gentle"] .pulseHalo,.svg[data-motion-style="gentle"] .hypeAura,.svg[data-motion-style="gentle"] .hypeFlare,.svg[data-motion-style="gentle"] .coinHypeExtreme,.svg[data-motion-style="gentle"] .earlyHalo,.svg[data-motion-style="gentle"] .flowDotLive{animation:none!important}
.root{background:radial-gradient(ellipse at 5% 40%,rgba(28,83,61,.20),transparent 52%),radial-gradient(ellipse at 95% 35%,rgba(125,88,31,.13),transparent 48%),#0e1817;border-color:#344c42;border-radius:12px}
.livingWaveBase{stroke-width:5;filter:blur(1px)}
.livingWave{stroke-width:2.25;opacity:.92}
.livingWaveNeutral{opacity:.62}
.earlyLivingWave{stroke-width:2.5}
.earlyCoin{fill:#352e20;stroke-width:2.75}
.earlyInfo{bottom:36px}
.status{right:12px;left:12px;max-width:none;white-space:normal;font-size:9px;line-height:1.4;border-color:#354b42;padding:6px 9px}
.quick a,.quick button{font-size:11px;padding:7px 8px}
@media(max-width:700px){.status{font-size:8px}.quick a,.quick button{font-size:10px;padding:6px}.earlyInfo{bottom:57px}}
:global(.wave-motion-control){display:inline-flex;align-items:center;gap:8px;color:#bcd6c9;font:600 12px/1.3 system-ui}
:global(.wave-motion-control select){min-height:32px;padding:5px 10px;border-radius:7px;border:1px solid #527a65;background:#152d23;color:#dcfbe9;cursor:pointer}
'''
p.write_text(s)

p=Path('tests/mobile-workspace.test.ts');s=p.read_text();s=s.replace('assert.match(wave,/animateMotion/);','assert.match(wave,/startContinuousWaves/);\n  assert.match(wave,/data-follow-wave/);');p.write_text(s)
p=Path('tests/fixtures/flow-trajectory-browser.mjs');s=p.read_text()
s=s.replace('document.querySelectorAll(".moving-flow-particle animateMotion").length','document.querySelectorAll(".moving-flow-particle[data-follow-wave]").length')
s=s.replace('document.querySelectorAll(".living-wave-path > animate").length','document.querySelectorAll(".living-wave-group[data-motion-key]").length')
s=s.replace('document.querySelectorAll(".moving-flow-particle animateMotion mpath").length','document.querySelectorAll(".moving-flow-particle[data-follow-wave]").length')
s=replace(s,'      waveMotion: document.querySelector(".living-wave-layer")?.getAttribute("data-wave-motion"),','      waveMotion: document.querySelector(".living-wave-layer")?.getAttribute("data-wave-motion"),\n      motionEngine: document.querySelector(".market-pan-surface")?.getAttribute("data-motion-engine"),')
s=replace(s,'assert.ok(ui.animationStates.every((row) => row.name !== "none" && row.state === "running"), "all focus-token waves must be actively animated");','assert.equal(ui.motionEngine,"raf-v2","geometry must be driven by the shared continuous frame loop");')
p.write_text(s)

p=Path('tests/browser-smoke.mjs');s=p.read_text()
s=replace(s,'import {checkUnifiedWaveMap} from "./fixtures/unified-map-browser-check.mjs";', 'import {checkUnifiedWaveMap} from "./fixtures/unified-map-browser-check.mjs";\nimport {checkContinuousMotion} from "./fixtures/continuous-motion-browser.mjs";')
s=replace(s,'  await checkUnifiedWaveMap(page);','  await checkUnifiedWaveMap(page);\n  await checkContinuousMotion(page);')
p.write_text(s)

p=Path('CHANGELOG.md');s=p.read_text();s=s.replace('# Changelog','# Changelog\n\n## Unreleased - continuous wave renderer\n\n- One requestAnimationFrame geometry engine for both GOOD and EARLY, with bounded frame rate and synchronized observed-trade markers.\n- Explicit Auto / Live / Pause motion controls. Reduced-motion Auto is gentle instead of a hidden hard stop.\n- Visible idle viewing no longer stops market updates after two minutes; hidden tabs still suspend polling and drawing.\n- Browser regressions measure real path changes, pause/resume, reduced motion and visibility recovery.\n- EARLY remains sampled/unverified; animation is not an execution feed or a profit guarantee.\n',1);p.write_text(s)
p=Path('README.md');s=p.read_text();s+='\n\n### Live wave motion\n\nThe Map uses one frame-driven SVG renderer for both sides. Choose Auto (gentle when the system requests reduced motion), Live, or Pause in the motion control. Motion does not depend on new RPC messages; data freshness is shown separately. Returning to a visible tab resumes the same animation clock without duplicate loops. Historical BUY/SELL markers are visual replays of observed samples; new impulse markers expire after 4.2 seconds. EARLY waves never fabricate individual swaps.\n';p.write_text(s)

# This one-shot generator is not part of the shipped application.
Path('.github/workflows/apply-wave-renderer.yml').unlink()
Path('scripts/apply_wave_renderer.py').unlink()
print('Applied continuous renderer patch; ready for normal PR CI.')
