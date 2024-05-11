import { task } from "hardhat/config";
import { BigNumber, Contract, Wallet, ContractFactory } from "ethers";
import { getDeployerWallet } from "../../utils/networks";
import DeploymentTools from "../../utils/DeploymentsTools";
import { Deployment, DeployParams } from "../../utils/types";
import chainIds from "../../utils/constants/chains";

task("deploy:prod:yakisoba", "Deploys the home chain contracts on the prod chain")
  .addParam("local", "Whether to deploy locally or not")
  .addParam("chainid", "The chainId name to deploy to")
  .addParam("asset", "The name of the base asset to use for the deployment")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    const deploy: string = "production";
    const homeChainId = 42161; // Arbitrum
    const chainId = chainIds[taskArgs.chainid];
    const local = taskArgs.local == "true" ? true : false;

    const {
      saveDeployment,
      getConstants,
      sleep,
      writeLightRegistry,
      makeContractName,
    } = DeploymentTools;
    const { a, p } = getConstants(chainId);
    const deployer: Wallet = await getDeployerWallet(ethers.provider);
    const assetName = taskArgs.asset;

    const assetAddress = a[assetName];
    console.log("Deploying contracts with the account:", deployer.address);

    console.log(
      "Account native balance:",
      ethers.utils.formatEther(
        await ethers.provider.getBalance(deployer.address)
      )
    );

    const yakisobaName = makeContractName("Yakisoba", assetName, chainId);
    const yakisobaSymbol = "as" + assetName;
    console.log("Deploying " + yakisobaName + " on Arbitrum");

    const YakisobaFactory: ContractFactory = await ethers.getContractFactory(
      "Yakisoba",
      deployer
    );

    console.log("Deploying Yakisoba...");
    const yakisoba: Contract = await YakisobaFactory.deploy(
      assetAddress,
      yakisobaName,
      yakisobaSymbol,
      p.performance_fee,
      p.management_fee,
      p.withdraw_fee
    );

    await yakisoba.deployed();

    if (!local) {
      console.log("Waiting 30 seconds for the contract to be mined...");
      await sleep(30000);
    }

    console.log("Yakisoba deployed to:", yakisoba.address);

    const yakisobaDeployment: Deployment = {
      name: yakisobaName,
      address: yakisoba.address,
      chainId: homeChainId,
      contract: "Yakisoba",
      deployTransaction: yakisoba.deployTransaction.hash,
      args: [
        assetAddress,
        yakisobaName,
        yakisobaSymbol,
        p.performance_fee,
        p.management_fee,
        p.withdraw_fee,
      ],
      verified: false,
      deployer: deployer.address,
    };

    await saveDeployment(deploy, yakisobaDeployment, local);
    await writeLightRegistry(deploy, yakisobaDeployment, local);

    console.log("Yakisoba deployment saved.");

    // Additional logic for persisting artifacts and verification with Tenderly
    if (!local) {

      console.log("Verifying on explorer...");

      await hre.run("verify:verify", {
        address: yakisoba.address,
      });

      yakisobaDeployment.verified = true;

      // We save the deployment file again
      await saveDeployment(deploy, yakisobaDeployment, local);

      console.log("Done! ✅");
    }

    console.log("Finished " + yakisobaName + " deployment ✅");
    console.log("----------------------------------------------------");
  });
