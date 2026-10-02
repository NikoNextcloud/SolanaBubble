// Verified against official PumpSwap IDL and Raydium cp-swap Swap accounts.
// https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump_amm.json
// https://github.com/raydium-io/raydium-cp-swap/tree/master/programs/cp-swap/src/instructions
export const swapPrograms=[
  {
    "program": "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    "name": "PumpSwap",
    "poolIndex": 0,
    "userIndex": 1,
    "userTokenIndices": [
      5,
      6
    ],
    "vaultIndices": [
      7,
      8
    ],
    "discriminators": [
      [
        102,
        6,
        61,
        18,
        1,
        218,
        235,
        234
      ],
      [
        198,
        46,
        21,
        82,
        180,
        217,
        232,
        112
      ],
      [
        51,
        230,
        133,
        164,
        1,
        127,
        131,
        173
      ]
    ]
  },
  {
    "program": "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
    "name": "Raydium CPMM",
    "poolIndex": 3,
    "userIndex": 0,
    "userTokenIndices": [
      4,
      5
    ],
    "vaultIndices": [
      6,
      7
    ],
    "discriminators": [
      [
        143,
        190,
        90,
        218,
        196,
        30,
        51,
        222
      ],
      [
        55,
        217,
        98,
        86,
        163,
        74,
        180,
        173
      ]
    ]
  }
] as const;
