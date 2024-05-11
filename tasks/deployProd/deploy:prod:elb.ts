import { task } from "hardhat/config";
import { Wallet, ContractFactory, Contract } from "ethers";
import { getDeployerWallet } from "../../utils/networks";
import DeploymentTools from "../../utils/DeploymentsTools";
import chainIds from "../../utils/constants/chains";

import { Deployment, DeployParams } from "../../utils/types";
import { AmplificationUtils } from "../../typechain-types/contracts/utils/AmplificationUtils";

task("deploy:prod:elb", "Deploys the home chain contracts on the prod chain")
  .addParam("local", "Whether to deploy locally or not")
  .addParam("chainid", "The chainId name to deploy to")
  .addParam("asset", "The base asset to use for the deployment")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;
    const upgrades = hre.upgrades;

    const deploy: string = "production";
    const homeChainId = 42161; // Arbitrum
    const local = taskArgs.local == "true" ? true : false;
    const chainId = chainIds[taskArgs.chainid];
    const assetName: string = taskArgs.asset;
    const {
      saveDeployment,
      getConstants,
      sleep,
      getDeployedContract,
      makeContractName,
      writeLightRegistry,
    } = DeploymentTools;
    const { a, p } = getConstants(Number(chainId));
    const assetAddress: string = a[assetName];
    const deployer: Wallet = await getDeployerWallet(ethers.provider);

    console.log("Deploying contracts with the account:", deployer.address);

    console.log(
      "Account native balance:",
      ethers.utils.formatEther(
        await ethers.provider.getBalance(deployer.address)
      )
    );

    console.log("Deploying SwapUtils");
    const swapUtilsName: string = makeContractName(
      "SwapUtils",
      assetName,
      chainId
    );
    const swapUtils: Contract = await (
      await ethers.getContractFactory("SwapUtils", deployer)
    ).deploy();

    await swapUtils.deployed();

    console.log("SwapUtils deployed at: ", swapUtils.address);

    const swapUtilsDeployment: Deployment = {
      name: swapUtilsName,
      address: swapUtils.address,
      chainId: homeChainId,
      contract: "SwapUtils",
      deployTransaction: swapUtils.deployTransaction.hash,
      args: [],
      verified: false,
      deployer: deployer.address,
    };

    await saveDeployment(deploy, swapUtilsDeployment, local);

    console.log("Deploying AmplificationUtils");
    const AmplificationUtilsName: string = makeContractName(
      "AmplificationUtils",
      assetName,
      chainId
    );
    const amplificationUtils: Contract = await (
      await ethers.getContractFactory("AmplificationUtils", deployer)
    ).deploy();

    await amplificationUtils.deployed();

    console.log("AmplificationUtils deployed at: ", amplificationUtils.address);

    const AmplificationUtilsDeployment: Deployment = {
      name: AmplificationUtilsName,
      address: amplificationUtils.address,
      chainId: homeChainId,
      contract: "AmplificationUtils",
      deployTransaction: amplificationUtils.deployTransaction.hash,
      args: [],
      verified: false,
      deployer: deployer.address,
    };

    await saveDeployment(deploy, AmplificationUtilsDeployment, local);

    console.log("Deploying Swap (ELB)");
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

    const deployParams: DeployParams = {
      local: local,
      deploy: deploy,
      chainId: homeChainId,
      provider: deployer,
    };
    const yakisoba: Contract = await getDeployedContract(
      makeContractName("Yakisoba", assetName, chainId),
      deployParams
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

    if (!local) {
      console.log("Waiting 30 seconds for transactions to be mined");
      await sleep(30000);
    }

    console.log("Swap deployed at: ", swap.address);

    const swapName: string = makeContractName("Swap", assetName, chainId);
    const swapDeployment: Deployment = {
      name: swapName,
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

    // Additional logic for persisting artifacts and verification with Tenderly
    if (!local) {
      console.log("Waiting 30 seconds for transactions to be mined");
      await sleep(30000);

      console.log("Verifying on Etherscan");
      await hre.run("verify:verify", {
        address: swap.address,
      });

      await hre.run("verify:verify", {
        address: swapUtils.address,
      });

      await hre.run("verify:verify", {
        address: amplificationUtils.address,
      });
      console.log("Done ✅");
    }

    console.log("Writing to Light Registry");

    await writeLightRegistry(deploy, swapDeployment, local);

    await writeLightRegistry(deploy, swapUtilsDeployment, local);

    await writeLightRegistry(deploy, AmplificationUtilsDeployment, local);

    console.log("Done ✅");

    console.log("Finished " + swapName + " deployment ✅");
    console.log("----------------------------------------------------");
  });
