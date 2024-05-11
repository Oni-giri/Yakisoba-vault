import { task } from "hardhat/config";
const { expect } = require("chai");
import { Deployment } from "../../../utils/types";
import deploymentTools from "../../../utils/DeploymentsTools";

import { JsonRpcProvider } from "@ethersproject/providers";
import { getDeployerWallet } from "../../../utils/networks";
var assert = require("assert");

import { Contract, ContractFactory, utils, Wallet } from "ethers";
import { Allocator } from "../../../typechain-types";

task("deploy:explore", "Explore remote")
  .addParam("deployment", "The deployment to run (production, alpha, staging)")
  .addParam("local", "Whether the deployment is ran locally")
  .setAction(async (taskArgs, hre) => {
    const ethers = hre.ethers;
    const upgrades = hre.upgrades;

    const deploy: string = taskArgs.deployment;
    const local: boolean = taskArgs.local == "true" ? true : false;

    const deployer: Wallet = await getDeployerWallet(ethers.provider);
    const {
      getDeployment,
      saveDeployment,
      getDeployedContract,
      getConstantsMock,
      sleep,
      getHomeChainId,
    } = deploymentTools;

    const { a, p } = getConstantsMock(deploy, "remote_chain_id");
    const homeChainId = getHomeChainId(hre, deploy);
    const remoteChainId: number = p.remote_chain_id;
    const usdc = a.usdc;

    const remoteBridge: Contract = await getDeployedContract(
      deploy,
      remoteChainId,
      "BridgeConnectorRemoteSTG",
      deployer,
      local
    );

    const strategyOneRemote: Contract = await getDeployedContract(
      deploy,
      remoteChainId,
      "StrategyOneRemote",
      deployer,
      local
    );

    const remoteAllocator: Contract = await getDeployedContract(
      deploy,
      remoteChainId,
      "Allocator",
      deployer,
      local
    );

    // console.log(await remoteAllocator.strategiesList(0));
    console.log(await remoteAllocator.strategyMap());
  });
