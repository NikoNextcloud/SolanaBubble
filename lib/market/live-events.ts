export type LiveMarketEvent={
  mint:string;
  signature:string;
  wallet:string;
  pool:string;
  side:'buy'|'sell';
  usd_value:number|null;
  quote_mint:string;
  quote_amount:number;
  evidence:'direct'|'routed';
  program:string;
  block_at:string;
  whale:boolean;
  wallet_pct_supply:number|null;
  observed_at:string;
};
