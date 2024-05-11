import { task } from "hardhat/config";
import deploymentTools from "../../../utils/DeploymentsTools";

import { getDeployerWallet } from "../../../utils/networks";
import { DeployParams } from "../../../utils/types";
import { Contract, Wallet } from "ethers";

import fs from "fs";

task("deploy:wave2:setup", "Deploys the Yakisoba contract")
  .addParam("deployment", "The deployment to run (production, alpha, staging)")
  .addParam("local", "Whether the deployment is ran locally")
  .setAction(async (taskArgs, hre) => {
    const ethers = hre.ethers;

    const deploy: string = taskArgs.deployment;
    const local: boolean = taskArgs.local == "true" ? true : false;

    const deployer: Wallet = await getDeployerWallet(ethers.provider);
    const { getDeployedContract, getConstantsMock, sleep, getHomeChainId } =
      deploymentTools;

    const { a, p } = getConstantsMock(deploy, "remote_chain_id");
    const remoteChainId: number = p.remote_chain_id;
    const usdc = a.usdc;

    const usdcAbi: any = JSON.parse(
      fs.readFileSync("tasks/deployMock/USDCMockStg.json").toString()
    );
    const usdcToken: Contract = new ethers.Contract(usdc, usdcAbi, deployer);

    const deployParams: DeployParams = {
      deploy: deploy,
      local: local,
      chainId: remoteChainId,
      provider: deployer,
    };

    const remoteBridge: Contract = await getDeployedContract(
      "BridgeConnectorRemoteSTG",
      deployParams
    );

    const strategyOneRemote: Contract = await getDeployedContract(
      "StrategyOneRemote",
      deployParams
    );

    const remoteAllocator: Contract = await getDeployedContract(
      "Allocator",
      deployParams
    );

    console.log("Setting up remote contracts");

    console.log("Attributing remote bridge to remote allocator");
    const checkBridge: string = await remoteAllocator.bridgeConnector();
    if (checkBridge != remoteBridge.address) {
      await remoteAllocator.setBridge(remoteBridge.address);
      local ? await sleep(15000) : null;
    } else {
      console.log("Bridge already attributed to remote allocator");
    }

    console.log("Attributing remote allocator to remote bridge");
    const checkAllocator: string = await remoteBridge.allocator();
    if (checkAllocator != remoteAllocator.address) {
      await remoteBridge.setAllocator(remoteAllocator.address);
      local ? await sleep(15000) : null;
    } else {
      console.log("Allocator already attributed to remote bridge");
    }

    console.log("Attributing strategy to remote allocator");
    const strategyList: any = await remoteAllocator.strategiesData(
      strategyOneRemote.address
    );
    if (strategyList[0] == "") {
      await remoteAllocator.addNewStrategy(
        strategyOneRemote.address,
        ethers.constants.MaxUint256,
        "Strategy Local"
      );
      local ? await sleep(15000) : null;
    } else {
      console.log("Strategy already added");
    }

    await remoteAllocator.dispatchAssets(
      [await usdcToken.balanceOf(remoteAllocator.address)],
      [strategyOneRemote.address]
    );
    console.log(
      "remote allocator balance",
      await usdcToken.balanceOf(remoteAllocator.address)
    );
    console.log(
      "strategy balance",
      await usdcToken.balanceOf(strategyOneRemote.address)
    );
    await remoteAllocator.liquidateStrategy(
      await usdcToken.balanceOf(strategyOneRemote.address),
      100,
      strategyOneRemote.address,
      false
    );

    console.log("Setup complete for remote contracts");
  });
