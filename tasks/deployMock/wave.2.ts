import { task } from "hardhat/config";
import { BigNumber, Contract, utils, Wallet } from "ethers";
import * as fs from "fs";
import { getDeployerWallet } from "../../utils/networks";
import DeploymentsTools from "../../utils/DeploymentsTools";
import { assert } from "console";

require("./wave.2/deploy:wave2:allocator");
require("./wave.2/deploy:wave2:bridge");
require("./wave.2/deploy:wave2:setup");
require("./wave.2/deploy:wave2:strategyMock");

task("deploy:wave2", "Deploys the remo chain contracts")
  .addParam("deployment", "The deployment to run (production, alpha, staging)")
  .addParam("local", "Whether to deploy locally or not")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;
    const deploy: string = taskArgs.deployment;
    const local: boolean = taskArgs.local == "true" ? true : false;
    assert(
      taskArgs.deployment == "alpha" ||
        taskArgs.deployment == "staging" ||
        taskArgs.deployment == "production",
      "invalid step"
    );

    const deployer: Wallet = await getDeployerWallet(ethers.provider);
    const getConstantsMock = DeploymentsTools.getConstantsMock;

    const { a, p } = getConstantsMock(deploy, "remote_chain_id");

    console.log("Deploying contracts with the account:", deployer.address);

    console.log(
      "Account native balance:",
      ethers.utils.formatEther(
        await ethers.provider.getBalance(deployer.address)
      )
    );

    const homeChainId = p.home_chain_id;
    const remoteChainId = p.remote_chain_id;

    console.log("Deploying wave 2");

    console.log("Deploying Allocator...");
    await hre.run("deploy:wave2:allocator", {
      deployment: deploy,
      network: taskArgs.local ? "localhost_remote" : a.remote_chain_name,
      local: taskArgs.local,
    });

    console.log("Deploying BridgeConnectorRemoteSTG...");
    await hre.run("deploy:wave2:bridge", {
      deployment: deploy,
      network: taskArgs.local ? "localhost_remote" : a.remote_chain_name,
      local: taskArgs.local,
    });

    console.log("Deploying StrategyOne...");
    await hre.run("deploy:wave2:strategyMock", {
      deployment: deploy,
      network: taskArgs.local ? "localhost_remote" : a.remote_chain_name,
      local: taskArgs.local,
    });

    console.log("Setting up the contracts...");
    await hre.run("deploy:wave2:setup", {
      deployment: deploy,
      network: taskArgs.local ? "localhost_remote" : a.remote_chain_name,
      local: taskArgs.local,
    });

    console.log("Wave 2 deployed");
  });

export {};
