import { utils, Wallet } from "ethers";
import addresses from "./constants/mocks/addressesMock";

export interface Deployment {
  name: string;
  contract: string;
  chainId: number;
  address: string;
  args: any;
  deployTransaction: string;
  verified: boolean;
  deployer: string;
}

export interface DeploymentIdentifier {
  deploy: string;
  chainId: number;
  name: string;
  address: string;
}

export interface Deployments {
  [address: string]: Deployment;
}

export interface RegistryLight {
  [name: string]: ContractData;
}

export interface ContractData {
  name: string;
  address: string;
}

export interface DeployParams {
  deploy: string;
  local: boolean;
  chainId: number;
  provider: Wallet;
}

export interface ParamsDict {
  lz_home_chain_id: number;
  lz_remote_chain_id: number;
  performance_fee: number;
  management_fee: number;
  withdraw_fee: number;
  initial_a: number;
  max_a: number;
  real_asset_index: number;
  virtual_asset_index: number;
  a_precision: number;
  seed_deposit: string;
  homeSrcPoolId: number;
  remoteSrcPoolId: number;
  bridgeGasAmount: number;
  updateGasAmount: number;
  yakisoba_name: string;
  yakisoba_symbol: string;
  home_chain_id: number;
  home_chain_name: string;
  remote_chain_id: number;
  remote_chain_name: string;
  contract_names: string[];
}

export interface Params {
  [key: string]: ParamsDict;
}

export interface LzChainParam {
  chainId: number;
  address: string;
}

export interface LzChainParams {
  [key: number]: LzChainParam;
}
