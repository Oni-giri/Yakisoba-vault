import { task } from "hardhat/config";
import { Deployment } from "../../../utils/types";
import DeploymentTools from "../../../utils/DeploymentsTools";

import { getDeployerWallet } from "../../../utils/networks";
var assert = require("assert");

import { Contract, ContractFactory, Wallet } from "ethers";
import { Allocator } from "../../../typechain-types";

task("deploy:wave1:allocator", "Deploys the Yakisoba contract")
  .addParam("deployment", "The deployment to run (production, alpha, staging)")
  .addParam("local", "Whether the deployment is ran locally")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;
    const upgrades = hre.upgrades;

    const deployer: Wallet = await getDeployerWallet(ethers.provider);
    const { saveDeployment, getConstantsMock, getHomeChainId } =
      DeploymentTools;

    const deploy: string = taskArgs.deployment;
    const local: boolean = taskArgs.local == "true" ? true : false;

    const { a, p } = getConstantsMock(deploy, "home_chain_id");
    const homeChainId = getHomeChainId(hre, deploy);
    const usdc = a.usdc;

    const AllocatorFactory: ContractFactory = await ethers.getContractFactory(
      "Allocator",
      deployer
    );

    const homeAllocator: Allocator = (await upgrades.deployProxy(
      AllocatorFactory,
      [usdc, homeChainId]
    )) as Allocator;

    await homeAllocator.deployed();

    console.log("Home allocator deployed to: \t", homeAllocator.address);

    const homeAllocatorDeployment: Deployment = {
      name: "Allocator",
      address: homeAllocator.address,
      chainId: homeChainId,
      contract: "Allocator",
      deployTransaction: homeAllocator.deployTransaction.hash,
      args: [usdc, p.home_chain_id],
      verified: false,
      deployer: deployer.address,
    };

    await saveDeployment(deploy, homeAllocatorDeployment, local);
  });
