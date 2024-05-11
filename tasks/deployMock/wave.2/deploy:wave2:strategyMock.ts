import { task } from "hardhat/config";

import { Deployment } from "../../../utils/types";
import DeploymentTools from "../../../utils/DeploymentsTools";

import { getDeployerWallet } from "../../../utils/networks";

import { Contract, ContractFactory, utils, Wallet } from "ethers";

task("deploy:wave2:strategyMock", "Deploys the Yakisoba contract")
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
    const remoteChainId: number = p.remote_chain_id;

    const StrategyOneRemote: ContractFactory = await ethers.getContractFactory(
      "MockPipeline",
      deployer
    );

    const remoteAllocatorDeployment: Deployment =
      await DeploymentTools.getDeployment(
        deploy,
        remoteChainId,
        "Allocator",
        local
      );

    const remoteStrategyOne: Contract = await StrategyOneRemote.deploy(
      ethers.constants.HashZero,
      0,
      a.usdc,
      remoteAllocatorDeployment.address,
      deployer.address
    );

    await remoteStrategyOne.deployed();

    const remoteStrategyOneDeployment: Deployment = {
      name: "StrategyOneRemote",
      address: remoteStrategyOne.address,
      chainId: remoteChainId,
      contract: "MockPipeline",
      deployTransaction: remoteStrategyOne.deployTransaction.hash,
      args: [
        ethers.constants.HashZero,
        0,
        a.usdc,
        remoteAllocatorDeployment.address,
        deployer.address,
      ],
      verified: false,
      deployer: deployer.address,
    };

    await saveDeployment(deploy, remoteStrategyOneDeployment, local);

    console.log(
      "Remote strategy one deployed to: \t",
      remoteStrategyOne.address
    );
  });
