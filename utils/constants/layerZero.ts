import { LzChainParams, LzChainParam } from "../types";

const layerZero: LzChainParams = {
  1: {
    // ETH mainnet
    chainId: 101,
    address: "0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675",
  },
  56: {
    // BSC mainnet
    chainId: 102,
    address: "0x3c2269811836af69497E5F486A85D7316753cf62",
  },
  43114: {
    // Avalanche mainnet
    chainId: 106,
    address: "0x3c2269811836af69497E5F486A85D7316753cf62",
  },
  137: {
    // Polygon mainnet
    chainId: 109,
    address: "0x3c2269811836af69497E5F486A85D7316753cf62",
  },
  42161: {
    // Arbitrum mainnet
    chainId: 110,
    address: "0x3c2269811836af69497E5F486A85D7316753cf62",
  },
  10: {
    // Optimism mainnet
    chainId: 111,
    address: "0x3c2269811836af69497E5F486A85D7316753cf62",
  },
  250: {
    // Fantom mainnet
    chainId: 112,
    address: "0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7",
  },
  1284: {
    // Moonbeam mainnet
    chainId: 126,
    address: "0x9740FF91F1985D8d2B71494aE1A2f723bb3Ed9E4",
  },
  1285: {
    // Moonriver mainnet
    chainId: 167,
    address: "0x7004396C99D5690da76A7C59057C5f3A53e01704",
  },
  97: {
    // BSC testnet
    chainId: 10102,
    address: "0x6Fcb97553D41516Cb228ac03FdC8B9a0a9df04A1",
  },
  43113: {
    // Avalanche testnet (fuji)
    chainId: 10106,
    address: "0x93f54D755A063cE7bB9e6Ac47Eccc8e33411d706",
  },
};

export default layerZero;
