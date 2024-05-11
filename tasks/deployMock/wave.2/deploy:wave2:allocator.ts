import { task } from "hardhat/config";
import { Deployment } from "../../../utils/types";
import DeploymentTools from "../../../utils/DeploymentsTools";

import { getDeployerWallet } from "../../../utils/networks";
var assert = require("assert");

import { Contract, ContractFactory, Wallet } from "ethers";
import { Allocator } from "../../../typechain-types";

task("deploy:wave2:allocator", "Deploys the Yakisoba contract")
  .addParam("deployment", "The deployment to run (production, alpha, staging)")
  .addParam("local", "Whether the deployment is ran locally")
  .setAction(async (taskArgs, hre) => {
    const ethers = hre.ethers;
    const upgrades = hre.upgrades;

    const deploy: string = taskArgs.deployment;
    const local: boolean = taskArgs.local == "true" ? true : false;

    const deployer: Wallet = await getDeployerWallet(ethers.provider);
    const { saveDeployment, getConstantsMock, getHomeChainId } =
      DeploymentTools;

    const { a, p } = getConstantsMock(deploy, "remote_chain_id");
    const homeChainId = getHomeChainId(hre, deploy);
    const remoteChainId: number = p.remote_chain_id;
    const usdc = a.usdc;

    const AllocatorFactory: ContractFactory = await ethers.getContractFactory(
      "Allocator",
      deployer
    );

    const remoteAllocator: Allocator = (await upgrades.deployProxy(
      AllocatorFactory,
      [usdc, homeChainId]
    )) as Allocator;

    await remoteAllocator.deployed();

    const remoteAllocatorDeployment: Deployment = {
      name: "Allocator",
      address: remoteAllocator.address,
      chainId: remoteChainId,
      contract: "Allocator",
      deployTransaction: remoteAllocator.deployTransaction.hash,
      args: [usdc, homeChainId],
      verified: false,
      deployer: deployer.address,
    };

    await saveDeployment(deploy, remoteAllocatorDeployment, local);

    console.log("Remote allocator deployed to: \t", remoteAllocator.address);
  });
