import layerZero from "./layerZero";
import addresses from "./addresses";
import { string } from "hardhat/internal/core/params/argumentTypes";

const params: { [key: number]: { [key: string]: any } } = {
  42161: {
    // Arbitrum mainnet - HOME
    lz_home_chain_id: layerZero[42161].chainId,
    performance_fee: 0,
    management_fee: 0,
    withdraw_fee: 0,
    initial_a: 400,
    max_a: 10 ** 6,
    real_asset_index: 1,
    virtual_asset_index: 0,
    a_precision: 100,
    seed_deposit: "1",
    stg_pool_id: {
      "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8": 1,
    }, // TODO: replace with stargate dict
    bridgeGasAmount: 400_000,
    updateGasAmount: 200_000,
    srcPoolid: {
      "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8": 1,
    },
    naming: {
      "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8": "USDC",
    },
    chain_name: "Arbitrum",
  },
};

export default params;
