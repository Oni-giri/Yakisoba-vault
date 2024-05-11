import layerZero from "./layerZero";

const addresses: { [key: number]: { [key: string]: string } } = {
  97: {
    // BSC testnet
    usdc: "0xF49E250aEB5abDf660d643583AdFd0be41464EfD", // BUSD
    stg_router: "0xbB0f1be1E9CE9cB27EA5b0c3a85B7cc3381d8176",
    layer_zero: layerZero[97].address,
  },
  43113: {
    // Avalanche testnet
    usdc: "0x4A0D1092E9df255cf95D72834Ea9255132782318",
    stg_router: "0x13093E05Eb890dfA6DacecBdE51d24DabAb2Faa1",
    layer_zero: layerZero[43113].address,
  },
  56: {
    // BSC mainnet
    usdc: "0x55d398326f99059fF775485246999027B3197955",
    stg_router: "0x4a364f8c717cAAD9A442737Eb7b8A55cc6cf18D8",
    layer_zero: layerZero[56].address,
    // Radiant BSC mainnet
    aave_lending_pool: "0xd50Cf00b6e600Dd036Ba8eF475677d816d6c4281",
    aave_usdc: "0x4Ff2DD7c6435789E0BB56B0553142Ad00878a004",
  },
  43114: {
    // Avalanche mainnet
    usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    stg_router: "0x45A01E4e04F14f7A4a6702c74187c5F6222033cd",
    layer_zero: layerZero[43114].address,
  },
  42161: {
    // Arbitrum mainnet
    usdc: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // This is bridged USDC
    stg_router: "0x53Bf833A5d6c4ddA888F69c22C88C9f356a41614",
    layer_zero: layerZero[42161].address,
    aave_lending_pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    aave_usdc: "0x625E7708f30cA75bfd92586e17077590C60eb4cD",
  },
};

export default addresses;
