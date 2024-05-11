import { task } from "hardhat/config";
import { Deployment } from "../../../utils/types";
import DeploymentTools from "../../../utils/DeploymentsTools";

import { getDeployerWallet } from "../../../utils/networks";

import { Contract, ContractFactory, Wallet } from "ethers";

task("deploy:wave1:elb", "Deploys the ELB contracts")
  .addParam("deployment", "The deployment to run (production, alpha, staging)")
  .addParam("local", "Whether the deployment is ran locally")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    const deploy: string = taskArgs.deployment;
    const local: boolean = taskArgs.local == "true" ? true : false;

    const deployer: Wallet = await getDeployerWallet(ethers.provider);
    const {
      getDeployment,
      saveDeployment,
      getAbi,
      getConstantsMock,
      getHomeChainId,
    } = DeploymentTools;

    const { a, p } = getConstantsMock(deploy, "home_chain_id");
    const homeChainId = getHomeChainId(hre, deploy);
    const usdc = a.usdc;

    const swapUtils: Contract = await (
      await ethers.getContractFactory("SwapUtils", deployer)
    ).deploy();

    const amplificationUtils: Contract = await (
      await ethers.getContractFactory("AmplificationUtils", deployer)
    ).deploy();

    const AmplificationUtilsDeployment: Deployment = {
      name: "AmplificationUtils",
      address: amplificationUtils.address,
      chainId: homeChainId,
      contract: "AmplificationUtils",
      deployTransaction: amplificationUtils.deployTransaction.hash,
      args: [],
      verified: false,
      deployer: deployer.address,
    };

    await saveDeployment(deploy, AmplificationUtilsDeployment, local);

    const swapUtilsDeployment: Deployment = {
      name: "SwapUtils",
      address: swapUtils.address,
      chainId: homeChainId,
      contract: "SwapUtils",
      deployTransaction: swapUtils.deployTransaction.hash,
      args: [],
      verified: false,
      deployer: deployer.address,
    };

    await saveDeployment(deploy, swapUtilsDeployment, local);

    const swapFactory: ContractFactory = await ethers.getContractFactory(
      "Swap",
      {
        signer: deployer,
        libraries: {
          AmplificationUtils: AmplificationUtilsDeployment.address,
          SwapUtils: swapUtilsDeployment.address,
        },
      }
    );

    // Can now prepare the deploy of the liquidity pool
    const virtual_token: string = ethers.constants.AddressZero;
    const aave_usdc_decimals: number = await (
      await ethers.getContractAt("IERC20Metadata", a.aave_usdc)
    ).decimals();

    const decimals: number[] = [aave_usdc_decimals, aave_usdc_decimals];
    const aaveTokens: string[] = [ethers.constants.AddressZero, a.aave_usdc];
    const realTokens: string[] = [virtual_token, a.usdc];

    const yakisoba: Deployment = await getDeployment(
      deploy,
      homeChainId,
      "Yakisoba",
      local
    );

    const swap: Contract = await swapFactory.deploy(
      aaveTokens,
      realTokens,
      decimals,
      400,
      a.aave_lending_pool,
      yakisoba.address
    );

    await swap.deployed();

    const swapDeployment: Deployment = {
      name: "Swap",
      address: swap.address,
      chainId: homeChainId,
      contract: "Swap",
      deployTransaction: swap.deployTransaction.hash,
      args: [
        aaveTokens,
        realTokens,
        decimals,
        400,
        a.aave_lending_pool,
        yakisoba.address,
      ],
      verified: false,
      deployer: deployer.address,
    };

    await saveDeployment(deploy, swapDeployment, local);

    console.log("Swap deployed to: \t\t", swap.address);
  });
