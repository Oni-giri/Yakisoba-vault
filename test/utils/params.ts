import { ethers } from "hardhat";

const params: { [key: string]: any } = {
  lz_home_chain_id: 101,
  lz_remote_chain_id: 102,
  performance_fee: 1000,
  management_fee: 100,
  withdraw_fee: 50,
  yakisoba_name: "Test Yakisoba",
  yakisoba_symbol: "CRT",
  initial_a: 400,
  max_a: 10 ** 6,
  real_asset_index: 1,
  virtual_asset_index: 0,
  a_precision: 100,
  seed_deposit: ethers.utils.parseUnits("1", 8),
  dstPoolId: 1,
  srcPoolId: 1,
};

export default params;
