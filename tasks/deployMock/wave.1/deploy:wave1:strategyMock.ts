import { task } from "hardhat/config";
import { Deployment } from "../../../utils/types";
import DeploymentTools from "../../../utils/DeploymentsTools";
import { getDeployerWallet } from "../../../utils/networks";

import { Contract, ContractFactory, utils, Wallet } from "ethers";

task("deploy:wave1:strategyMock", "Deploys a mock strategy contracts")
  .addParam("deployment", "The deployment to run (production, alpha, staging)")
  .addParam("local", "Whether the deployment is ran locally")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    const deploy: string = taskArgs.deployment;
    const local: boolean = taskArgs.local == "true" ? true : false;

    const deployer: Wallet = await getDeployerWallet(ethers.provider);
    const { saveDeployment, getConstantsMock, getHomeChainId } =
      DeploymentTools;

    const { a, p } = getConstantsMock(deploy, "home_chain_id");
    const homeChainId = getHomeChainId(hre, deploy);
    const usdc = a.usdc;

    const homeAllocator: Deployment = await DeploymentTools.getDeployment(
      deploy,
      homeChainId,
      "Allocator",
      local
    );

    // We deploy a local strategy
    const strategy: ContractFactory = await ethers.getContractFactory(
      "MockPipeline",
      deployer
    );

    const strategyOneHome: Contract = await strategy.deploy(
      ethers.constants.HashZero,
      ethers.constants.Zero,
      a.usdc,
      homeAllocator.address,
      deployer.address
    );

    await strategyOneHome.deployed();

    console.log("StrategyOneHome deployed at: \t", strategyOneHome.address);

    const strategyOneHomeDeployment: Deployment = {
      name: "StrategyOneHome",
      address: strategyOneHome.address,
      chainId: homeChainId,
      contract: "MockPipeline",
      deployTransaction: strategyOneHome.deployTransaction.hash,
      args: [
        ethers.constants.HashZero,
        ethers.constants.Zero,
        a.usdc,
        homeAllocator.address,
        deployer.address,
      ],
      verified: false,
      deployer: deployer.address,
    };

    await saveDeployment(deploy, strategyOneHomeDeployment, local);
  });
