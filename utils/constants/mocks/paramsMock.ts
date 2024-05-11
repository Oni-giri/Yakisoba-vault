import { BigNumber, utils } from "ethers";
import { Params } from "../types";
import layerZero from "../layerZero";

const params: Params = {
  alpha: {
    lz_home_chain_id: layerZero[56].chainId, // BSC mainnet
    lz_remote_chain_id: layerZero[43114].chainId, // Avalanche mainnet
    performance_fee: 1000,
    management_fee: 100,
    withdraw_fee: 50,
    initial_a: 400,
    max_a: 10 ** 6,
    real_asset_index: 1,
    virtual_asset_index: 0,
    a_precision: 100,
    seed_deposit: "1",
    homeSrcPoolId: 2, // USDT
    remoteSrcPoolId: 1, // USDC
    bridgeGasAmount: 400_000,
    updateGasAmount: 200_000,
    yakisoba_name: "Yakisoba USDC",
    yakisoba_symbol: "crUSDC",
    home_chain_id: 56,
    home_chain_name: "bsc",
    remote_chain_id: 43114,
    remote_chain_name: "avalanche",
    contract_names: [
      "Yakisoba",
      "BridgeConnectorHome",
      "BridgeConnectorRemote",
      "Allocator",
      "StrategyOneHome",
      "StrategyOneRemote",
      "Swap",
      "AmplificationUtils",
      "SwapUtils",
    ],
  },
  staging: {
    lz_home_chain_id: layerZero[97].chainId, // BSC testnet
    lz_remote_chain_id: layerZero[43113].chainId, // Avalanche fuji
    performance_fee: 1000,
    management_fee: 100,
    withdraw_fee: 50,
    initial_a: 400,
    max_a: 10 ** 6,
    real_asset_index: 1,
    virtual_asset_index: 0,
    a_precision: 100,
    seed_deposit: "1",
    homeSrcPoolId: 2,
    remoteSrcPoolId: 1,
    bridgeGasAmount: 400_000,
    updateGasAmount: 200_000,
    yakisoba_name: "Yakisoba USDC",
    yakisoba_symbol: "crUSDC",
    home_chain_id: 97,
    home_chain_name: "bsc_testnet",
    remote_chain_id: 43113,
    remote_chain_name: "fuji",
    contract_names: [
      "Yakisoba",
      "BridgeConnectorHome",
      "BridgeConnectorRemote",
      "Allocator",
      "StrategyOneHome",
      "StrategyOneRemote",
    ],
  },
};

export default params;
