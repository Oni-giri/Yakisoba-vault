import { task } from "hardhat/config";
import { Wallet, ContractFactory, Contract } from "ethers";
import * as fs from "fs";
import { getDeployerWallet } from "../../utils/networks";
import DeploymentTools from "../../utils/DeploymentsTools";
import { expect } from "chai";

import { Deployment } from "../../utils/types";
import { DeployParams } from "../../utils/types";
import { Allocator } from "../../typechain-types/contracts/Allocator";
import chainIds from "../../utils/constants/chains";

task(
  "deploy:prod:allocator",
  "Deploys the home chain contracts on the prod chain"
)
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
    const allocatorName: string = makeContractName(
      "Allocator",
      assetName,
      homeChainId
    );

    console.log("Deploying contracts with the account:", deployer.address);

    console.log(
      "Account native balance:",
      ethers.utils.formatEther(
        await ethers.provider.getBalance(deployer.address)
      )
    );

    const AllocatorFactory: ContractFactory = await ethers.getContractFactory(
      "Allocator",
      deployer
    );

    const allocator: Allocator = (await upgrades.deployProxy(AllocatorFactory, [
      assetAddress,
      homeChainId,
    ])) as Allocator;

    await allocator.deployed();

    console.log("Home allocator deployed to: \t", allocator.address);

    const allocatorDeployment: Deployment = {
      name: allocatorName,
      address: allocator.address,
      chainId: homeChainId,
      contract: "Allocator",
      deployTransaction: allocator.deployTransaction.hash,
      args: [assetAddress, p.home_chain_id],
      verified: false,
      deployer: deployer.address,
    };

    console.log("Saving deployment file...");

    await saveDeployment(deploy, allocatorDeployment, local);
    await writeLightRegistry(deploy, allocatorDeployment, local);

    console.log("Deployment file saved! ✅");

    if (!local) {
      console.log("Waiting for 30 seconds for the transaction to be mined...");
      await sleep(30000);
    }

    console.log("Done! ✅");

    if (chainId == homeChainId) {
      console.log("Referencing the yakisoba to the home allocator...");
      // We add the yakisoba then to the allocator
      const deployParams: DeployParams = {
        local: local,
        deploy: deploy,
        chainId: homeChainId,
        provider: deployer,
      };

      const yakisoba: Contract = (await getDeployedContract(
        makeContractName("Yakisoba", assetName, chainId),
        deployParams
      )) as Contract;

      expect(await yakisoba.asset()).to.equal(assetAddress);

      if ((await allocator.bridgeConnector()) == ethers.constants.AddressZero) {
        await allocator.setBridge(yakisoba.address);

        if (!local) {
          console.log(
            "Waiting for 30 seconds for the transaction to be mined..."
          );
          await sleep(30000);
          console.log("Done! ✅");
        }
      } else {
        console.log("Yakisoba already set 🚨");
      }

      console.log("Adding the allocator to the yakisoba...");
      await yakisoba.addChain(
        homeChainId,
        ethers.constants.MaxInt256,
        allocator.address,
        allocator.address,
        allocator.address,
        ethers.constants.HashZero
      );
      if (!local) {
        console.log(
          "Waiting for 30 seconds for the transaction to be mined..."
        );
        await sleep(30000);
        console.log("Done! ✅");

        console.log("Verifying on explorer...");

        await hre.run("verify:verify", {
          address: allocator.address,
        });

        allocatorDeployment.verified = true;

        // We save the deployment file again
        await saveDeployment(deploy, allocatorDeployment, local);

        console.log("Done! ✅");
      }
    }

    console.log("Finished " + allocatorName + " deployment ✅");
    console.log("----------------------------------------------------");
  });
