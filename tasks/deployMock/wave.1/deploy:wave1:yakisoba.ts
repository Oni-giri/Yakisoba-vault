import { task, subtask } from "hardhat/config";
import { Deployment } from "../../../utils/types";
import DeploymentTools from "../../../utils/DeploymentsTools";
import { ContractFactory, utils, Wallet } from "ethers";
import { Yakisoba } from "../../../typechain-types";
import { getDeployerWallet } from "../../../utils/networks";

task("deploy:wave1:yakisoba", "Deploys the Yakisoba contract")
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

    const yakisobaFactory: ContractFactory = await ethers.getContractFactory(
      "Yakisoba",
      deployer
    );

    const yakisoba = await yakisobaFactory.deploy(
      usdc,
      p.yakisoba_name,
      p.yakisoba_symbol,
      p.performance_fee,
      p.management_fee,
      p.withdraw_fee
    );

    await yakisoba.deployed();

    console.log("Yakisoba deployed to: \t", yakisoba.address);

    const yakisobaDeployment: Deployment = {
      name: "Yakisoba",
      address: yakisoba.address,
      chainId: homeChainId,
      contract: "Yakisoba",
      deployTransaction: yakisoba.deployTransaction.hash,
      args: [
        usdc,
        p.yakisoba_name,
        p.yakisoba_symbol,
        p.performance_fee,
        p.management_fee,
        p.withdraw_fee,
      ],
      verified: false,
      deployer: deployer.address,
    };

    await saveDeployment(deploy, yakisobaDeployment, local);

    console.log("Yakisoba deployment saved.");
  });

export {};
