export type GoodOpportunitySignal={active:boolean;tier:'avoid'|'watch'|'good'|'strong';score:number;hypeTrend:'rising'|'falling'|'flat'|'unknown';reasons:string[];blockers:string[]};

const oppFinite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const oppClamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));

export function opportunityTokenStrength(buys:number,sells:number,buyUsd:number|null=null,sellUsd:number|null=null){
  const countTotal=Math.max(0,buys)+Math.max(0,sells);
  const countBalance=countTotal?(Math.max(0,buys)-Math.max(0,sells))/countTotal:0;
  const priced=oppFinite(buyUsd)&&oppFinite(sellUsd)&&(buyUsd!+sellUsd!)>0;
  const usdBalance=priced?(buyUsd!-sellUsd!)/(buyUsd!+sellUsd!):countBalance;
  return Math.round(oppClamp((countBalance*.7+usdBalance*.3)*100,-100,100));
}

export function goodOpportunitySignal(token:any,strength=0):GoodOpportunitySignal{
  const opportunity=oppFinite(token.opportunityScore)?oppClamp(token.opportunityScore,0,100):0;
  const confidence=oppFinite(token.signalConfidenceScore)?oppClamp(token.signalConfidenceScore,0,100):0;
  const risk=oppFinite(token.manipulationRiskScore)?oppClamp(token.manipulationRiskScore,0,100):oppFinite(token.riskScore)?oppClamp(token.riskScore,0,100):100;
  const capital=oppFinite(token.capitalFlowScore)?oppClamp(token.capitalFlowScore,0,100):50;
  const momentum=oppFinite(token.momentumScore)?oppClamp(token.momentumScore,0,100):50;
  const velocity=oppFinite(token.hypeVelocity)?token.hypeVelocity:null;
  const acceleration=oppFinite(token.hypeAcceleration)?token.hypeAcceleration:0;
  const hypeTrend:GoodOpportunitySignal['hypeTrend']=velocity==null?'unknown':velocity>.25?'rising':velocity<-.25?'falling':'flat';
  const pressure=oppFinite(token.observedBuyPressure15m)?oppClamp(token.observedBuyPressure15m,0,100):oppFinite(token.buyPressure)?oppClamp(token.buyPressure,0,100):oppClamp(50+strength/2,0,100);
  const persistence=oppFinite(token.trendPersistenceScore)?oppClamp(token.trendPersistenceScore,0,100):50;
  const liquidityTrend=oppFinite(token.liquidityChangePct)?oppClamp(token.liquidityChangePct,-100,100):0;
  const traffic=token.trafficEvidence??token.trafficSample?.evidence??null;
  const strengthScore=oppClamp(50+strength/2,0,100);
  const velocityScore=velocity==null?45:oppClamp(50+velocity*9+acceleration*12,0,100);
  let score=opportunity*.24+confidence*.17+capital*.16+momentum*.12+(100-risk)*.11+strengthScore*.08+velocityScore*.07+persistence*.05;
  if(token.divergenceSignal==='bullish')score+=4;
  if(token.divergenceSignal==='bearish')score-=14;
  if(token.liquidityWarning)score-=24;
  if(liquidityTrend<=-12)score-=8;
  if(traffic==='degraded')score-=7;
  if(strength<0)score-=Math.min(14,Math.abs(strength)*.14);
  if(velocity!=null&&velocity<0)score-=Math.min(14,Math.abs(velocity)*4);
  score=Math.round(oppClamp(score,0,100));

  const blockers:string[]=[];
  if(opportunity<68)blockers.push('Opportunity below 68');
  if(confidence<60)blockers.push('Confidence below 60');
  if(risk>55)blockers.push('Risk above 55');
  if(capital<55)blockers.push('Capital Flow below 55');
  if(momentum<58)blockers.push('Momentum below 58');
  if(strength<8)blockers.push('BUY strength below +8');
  if(pressure<54)blockers.push('Buy pressure below 54%');
  if(token.liquidityWarning)blockers.push('Liquidity warning');
  if(traffic==='degraded')blockers.push('Live trade coverage degraded');
  if(token.divergenceSignal==='bearish')blockers.push('Bearish divergence');
  if(velocity!=null&&velocity<-.15)blockers.push('Hype is falling');
  const hypeConstructive=velocity!=null?velocity>=.15:token.divergenceSignal==='bullish'&&momentum>=70;
  if(!hypeConstructive)blockers.push(velocity==null?'Hype direction unconfirmed':'Hype not rising yet');

  const active=score>=72&&blockers.length===0;
  const strong=active&&score>=80&&confidence>=72&&risk<=40&&capital>=65&&strength>=18&&(velocity??0)>=.5;
  const tier:GoodOpportunitySignal['tier']=strong?'strong':active?'good':score>=60&&risk<=65?'watch':'avoid';
  const reasons:string[]=[];
  if(opportunity>=68)reasons.push('Opportunity '+Math.round(opportunity));
  if(confidence>=60)reasons.push('Confidence '+Math.round(confidence));
  if(capital>=55)reasons.push('Capital Flow '+Math.round(capital));
  if(momentum>=58)reasons.push('Momentum '+Math.round(momentum));
  if(strength>=8)reasons.push('BUY Strength +'+Math.round(strength));
  if(pressure>=54)reasons.push('Buy Pressure '+Math.round(pressure)+'%');
  if(velocity!=null&&velocity>=.15)reasons.push('Hype rising '+velocity.toFixed(2)+'/min');
  if(token.divergenceSignal==='bullish')reasons.push('Bullish divergence');
  if(risk<=55)reasons.push('Risk '+Math.round(risk));
  return {active,tier,score,hypeTrend,reasons,blockers};
}
