import { task } from "hardhat/config";
const { expect } = require("chai");
import DeploymentTools from "../../../utils/DeploymentsTools";
import { DeployParams } from "../../../utils/types";

import { getDeployerWallet } from "../../../utils/networks";
import { BigNumber, Contract, ContractFactory, utils, Wallet } from "ethers";
import { deploy } from "@openzeppelin/hardhat-upgrades/dist/utils";

task("test:deploy:remote", "Tests the remote deployment's setup")
  .addParam("deployment", "The deployment to run (production, alpha, staging)")
  .addParam("local", "If we are deploying on the local network")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    const deployer: Wallet = await getDeployerWallet(ethers.provider);
    const { getConstantsMock, getDeployedContract } = DeploymentTools;

    const deploy: string = taskArgs.deployment;
    const local: boolean = taskArgs.local == "true" ? true : false;

    const { a, p } = getConstantsMock(deploy, "remote_chain_id");

    const homeChainId = p.home_chain_id;
    const remoteChainId: number = p.remote_chain_id;
    const usdc = a.usdc;

    const deployParamsRemote: DeployParams = {
      deploy: deploy,
      local: local,
      provider: deployer,
      chainId: remoteChainId,
    };

    const deployParamsHome: DeployParams = {
      deploy: deploy,
      local: local,
      provider: deployer,
      chainId: homeChainId,
    };

    const remoteAllocator: Contract = await getDeployedContract(
      "Allocator",
      deployParamsRemote
    );

    const homeBridge: Contract = await getDeployedContract(
      "BridgeConnectorHomeSTG",
      deployParamsHome
    );

    const remoteBridge: Contract = await getDeployedContract(
      "BridgeConnectorRemoteSTG",
      deployParamsRemote
    );

    const strategyOneRemote: Contract = await getDeployedContract(
      "StrategyOneRemote",
      deployParamsRemote
    );

    expect(await remoteAllocator.bridgeConnector()).to.equal(
      remoteBridge.address
    );
    expect(await remoteAllocator.strategiesList(0)).to.equal(
      strategyOneRemote.address
    );

    expect(await remoteBridge.allocator()).to.equal(remoteAllocator.address);
    expect(await remoteBridge.homeBridge()).to.equal(homeBridge.address);
    expect(await remoteBridge.dstPoolId()).to.equal(p.homeSrcPoolId);
    expect(await remoteBridge.srcPoolId()).to.equal(p.remoteSrcPoolId);

    console.log("Remote deployment config ✅");
  });
