// Verified against official program IDLs / generated instruction clients.
// PumpSwap: https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump_amm.json
// Raydium CPMM/CLMM: https://github.com/raydium-io/raydium-idl
// Meteora DLMM: https://github.com/MeteoraAg/dlmm-sdk/blob/main/idls/dlmm.json
// Orca Whirlpool: https://github.com/orca-so/whirlpools
export const swapPrograms=[
  {
    program:"pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    name:"PumpSwap",
    poolIndex:0,userIndex:1,userTokenIndices:[5,6],vaultIndices:[7,8],
    discriminators:[
      [102,6,61,18,1,218,235,234],
      [198,46,21,82,180,217,232,112],
      [51,230,133,164,1,127,131,173],
    ],
  },
  {
    program:"CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
    name:"Raydium CPMM",
    poolIndex:3,userIndex:0,userTokenIndices:[4,5],vaultIndices:[6,7],
    discriminators:[
      [143,190,90,218,196,30,51,222],
      [55,217,98,86,163,74,180,173],
    ],
  },
  {
    program:"CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
    name:"Raydium CLMM",
    poolIndex:2,userIndex:0,userTokenIndices:[3,4],vaultIndices:[5,6],
    discriminators:[
      [248,198,158,145,225,117,135,200],
      [43,4,237,11,26,201,30,98],
    ],
  },
  {
    program:"LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    name:"Meteora DLMM",
    poolIndex:0,userIndex:10,userTokenIndices:[4,5],vaultIndices:[2,3],
    discriminators:[
      [248,198,158,145,225,117,135,200],
      [65,75,63,76,235,91,91,136],
      [250,73,101,33,38,207,75,184],
      [43,215,247,132,137,60,243,81],
      [56,173,230,208,173,228,156,205],
      [74,98,192,214,177,51,75,51],
    ],
  },
  {
    program:"whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
    name:"Orca Whirlpool",
    poolIndex:2,userIndex:1,userTokenIndices:[3,5],vaultIndices:[4,6],
    discriminators:[[248,198,158,145,225,117,135,200]],
  },
  {
    program:"whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
    name:"Orca Whirlpool v2",
    poolIndex:4,userIndex:3,userTokenIndices:[7,9],vaultIndices:[8,10],
    discriminators:[[43,4,237,11,26,201,30,98]],
  },
] as const;
