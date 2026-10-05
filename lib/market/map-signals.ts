import type {WatchToken} from '../watchlist';
import type {TrafficSummary} from './traffic/summary';
import {observationQuality} from './quality';
export type BubbleState='up'|'down'|'stable'|'unbacked'|'unknown';
export type TrafficConfidenceLevel='reliable'|'partial'|'insufficient';

export function trafficConfidence(sample:TrafficSummary|null|undefined,now=Date.now()) {
  const fresh=sample&&observationQuality(sample.observedAt,now).status==='recent';
  if(!sample||!fresh)return {level:'insufficient' as const,label:'Недостатъчни данни'};
  if(sample.evidence==='usable'&&sample.recognizedTransactions>=5){
    const direct=sample.directRecognizedTransactions??sample.recognizedTransactions;
    if(direct>=3)return {level:'reliable' as const,label:'Надеждна извадка'};
    return {level:'partial' as const,label:'Маршрутна извадка'};
  }
  if(sample.evidence==='degraded')return {level:'partial' as const,label:'Частична извадка'};
  return {level:'insufficient' as const,label:'Недостатъчни данни'};
}

/** Descriptive heuristic using rolling 1h trade counts, not measured swap dollars. */
export function bubbleSignal(t:WatchToken,now=Date.now()) {
  const fresh=observationQuality(t.marketObservedAt,now).status==='recent';
  const trades=(t.buys1h??0)+(t.sells1h??0);
  const pressure=trades>=20&&Number.isFinite(t.buys1h)&&Number.isFinite(t.sells1h)?(t.buys1h!)/trades*100:null;
  const velocity=typeof t.hypeVelocity==='number'&&Number.isFinite(t.hypeVelocity)?t.hypeVelocity:null;
  const liquidityDrop=fresh&&t.liquidityWarning===true;
  const holderFresh=observationQuality(t.holderObservedAt,now,5).status==='recent';
  const growth=t.holderWindows?.['5'];
  const holderSupport=holderFresh&&growth&&observationQuality(growth.observedAt,now,5).status==='recent'?growth.holderGrowthPct:null;
  const reasons:string[]=[];
  let state:BubbleState='unknown',arrow='?',label='Недостатъчно данни';
  let flow=fresh&&pressure!=null&&velocity!=null?(pressure>=60?'in':pressure<=40?'out':'flat'):'flat';
  if(fresh&&pressure!=null&&velocity!=null){
    reasons.push(`Покупки: ${pressure.toFixed(0)}% от ${trades} сделки за последния 1h.`,`Hype velocity: ${velocity.toFixed(2)} H/min.`);
    if(velocity>=.5&&(pressure<=50||(t.liquidityChangePct??0)<=-10||(holderSupport!=null&&holderSupport<0))){state='unbacked';arrow='↓';label='Hype без подкрепа';reasons.push('Hype расте, но покупки, ликвидност или наблюдавани holders не го подкрепят.');}
    else if(pressure>=60&&velocity>=.5&&!liquidityDrop&&(t.liquidityChangePct??0)>-5){state='up';arrow='↑';label='Покупки ↑ · оц.';reasons.push('Преобладават покупки по брой сделки и Hype набира скорост.');}
    else if(pressure<=40||(pressure<60&&velocity<=-.5)){state='down';arrow='↓';label='Продажби ↑ · оц.';reasons.push('Преобладават продажби или покупателната подкрепа отслабва с Hype.');}
    else {state='stable';arrow='→';label='Баланс → · оц.';reasons.push('Няма съгласуван сигнал за ускоряване.');}
  }else reasons.push(!fresh?'Market snapshot липсва или е стар (≥10m).':trades<20?'Твърде малко сделки (<20 за 1h).':'Липсва сравнима Hype velocity.');
  const sample=t.trafficSample, sw=sample?.windows['15'];
  if(sample&&sw&&observationQuality(sample.observedAt,now).status==='recent'&&sw.swaps>=5){
    reasons.push(`Partial swap sample: ${sw.buyers} buyers / ${sw.sellers} sellers, ${sw.buys} buys / ${sw.sells} sells in 15m ending ${sample.observedAt}. Selected pool only.`);
    if(sw.netUsd!=null){
      flow=sw.netUsd>0?'in':sw.netUsd<0?'out':'flat';
      reasons.push(`Sample net: $${sw.netUsd.toFixed(0)}; USDC=$1 / SOL valued at scan time. Not whole-market inflow.`);
      if(state!=='unbacked'&&!liquidityDrop){
        if(sw.netUsd<0){state='down';arrow='↓';label='Продажби · sample';}
        else if(sw.buyers>=5&&sw.netUsd>0){state='up';arrow='↑';label=(sw.top3BuyerSharePct??0)>=80?'Концентрация · sample':'Купувачи ↑ · sample';}
        else if(sw.netUsd>0){state='stable';arrow='→';label='Малко buyers · sample';}
      }
    }
    if(sw.quickResellers>=3&&sw.quickResellers/Math.max(1,sw.buyers)>=.5){label='Препродаване · sample';reasons.push('At least half of sampled buyers sold again within 15m; does not establish profit or bots.');}
  }
  if(holderSupport!=null)reasons.push(`Holder growth за приблизително 5m: ${holderSupport.toFixed(1)}%.`);else reasons.push('Holder потвърждението за 5m е неизвестно.');
  if(liquidityDrop)reasons.push(`Liquidity ↓ ${t.liquidityChangePct?.toFixed(1)??'—'}%; спад спрямо предходния snapshot.`);
  const whaleEnter=fresh&&holderFresh?Math.max(0,t.whaleEnter??0):0,whaleExit=fresh&&holderFresh?Math.max(0,t.whaleExit??0):0;
  const whaleLabel=[whaleEnter?`Whale +${whaleEnter}`:'',whaleExit?`${whaleEnter?'':'Whale '}−${whaleExit}`:''].filter(Boolean).join(' / ');
  if(whaleLabel)reasons.push(`${whaleLabel}: owners преминават прага 1% supply; включва pool/program owners, не доказва покупки/продажби.`);
  const riskWarning=fresh&&(t.riskScore??0)>=50;
  if(riskWarning)reasons.push(`Risk ${t.riskScore}/100: ${t.riskReasons?.join('; ')||'повишен heuristic risk'}.`);
  return {state,arrow,label,flow,pressure,reasons,liquidityDrop,whaleLabel,riskWarning,fresh};
}
