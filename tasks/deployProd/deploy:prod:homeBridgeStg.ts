import { task } from "hardhat/config";
import { BigNumber, Contract, Wallet, ContractFactory } from "ethers";
import * as fs from "fs";
import { getDeployerWallet } from "../../utils/networks";
import { assert } from "console";
import DeploymentTools from "../../utils/DeploymentsTools";
import { Allocator } from "../../typechain-types";
import { Deployment } from "../../utils/types";
import { DeployParams } from "../../utils/types";
import chainIds from "../../utils/constants/chains";

task(
  "deploy:prod:homeBridgeStg",
  "Deploys the home chain contracts on the prod chain"
)
  .addParam("local", "Whether to deploy locally or not")
  .addParam("chainid", "The chainId to deploy to")
  .addParam("asset", "The base asset to use for the deployment")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;
    const upgrades = hre.upgrades;

    const deploy: string = "production";
    const homeChainId = 42161; // Arbitrum
    const local = taskArgs.local == "true" ? true : false;
    const asset: string = taskArgs.asset;
    const {
      saveDeployment,
      getConstants,
      sleep,
      getDeployedContract,
      makeContractName,
      writeLightRegistry,
    } = DeploymentTools;
    const { a, p } = getConstants(homeChainId);
    const deployer: Wallet = await getDeployerWallet(ethers.provider);
    const chainId = chainIds[taskArgs.chainid];
    const assetName = taskArgs.asset;
    const bridgeName = makeContractName(
      "BridgeConnectorHomeSTG",
      asset,
      chainId
    );
    console.log("Deploying contracts with the account:", deployer.address);

    console.log(
      "Account native balance:",
      ethers.utils.formatEther(
        await ethers.provider.getBalance(deployer.address)
      )
    );

    const deployParams: DeployParams = {
      local: local,
      chainId: homeChainId,
      provider: deployer,
      deploy: deploy,
    };

    const yakisoba = await getDeployedContract(
      makeContractName("Yakisoba", assetName, chainId),
      deployParams
    );
    const homeAllocator = await getDeployedContract(
      makeContractName("Allocator", asset, chainId),
      deployParams
    );
    const bridgeHomeFactory: ContractFactory = await ethers.getContractFactory(
      "BridgeConnectorHomeSTG",
      deployer
    );
    const bridgeConnectorHomeSTG: Contract = (await bridgeHomeFactory.deploy(
      yakisoba.address,
      a[assetName],
      a.stg_router,
      a.layer_zero,
      p["stg_pool_id"][a[assetName]],
      p.lz_home_chain_id
    )) as Contract;

    await bridgeConnectorHomeSTG.deployed();

    console.log("Home bridge deployed to: \t", bridgeConnectorHomeSTG.address);

    const bridgeConnectorHomeSTGDeployment: Deployment = {
      name: bridgeName,
      address: bridgeConnectorHomeSTG.address,
      chainId: homeChainId,
      contract: "BridgeConnectorHomeSTG",
      deployTransaction: bridgeConnectorHomeSTG.deployTransaction.hash,
      args: [
        yakisoba.address,
        a[assetName],
        a.stg_router,
        a.layer_zero,
        p["stg_pool_id"][a[assetName]],
        p.lz_home_chain_id,
      ],
      verified: false,
      deployer: deployer.address,
    };

    await saveDeployment(deploy, bridgeConnectorHomeSTGDeployment, local);
    await writeLightRegistry(deploy, bridgeConnectorHomeSTGDeployment, local);

    if (!local) {
      console.log("Sleeping for 30 seconds to allow transactions to be mined");
      await sleep(30000);

      console.log("Verifying on explorer...");

      await hre.run("verify:verify", {
        address: bridgeConnectorHomeSTG.address,
      });

      bridgeConnectorHomeSTGDeployment.verified = true;

      // We save the deployment file again
      await saveDeployment(deploy, bridgeConnectorHomeSTGDeployment, local);

      console.log("Done! ✅");
    }

    console.log("Adding home chain to yakisoba");
    await yakisoba.addChain(
      homeChainId,
      ethers.constants.MaxUint256,
      homeAllocator.address,
      homeAllocator.address,
      homeAllocator.address,
      ethers.constants.HashZero
    );

    console.log("Done! ✅");

    console.log("Finished " + bridgeName + " deployment ✅");
    console.log("----------------------------------------------------");
  });
