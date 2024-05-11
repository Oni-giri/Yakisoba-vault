import { task } from "hardhat/config";
import { BigNumber, Contract, utils, Wallet } from "ethers";
import * as fs from "fs";
import { getDeployerWallet } from "../../utils/networks";
import { assert } from "console";
import DeploymentTools from "../../utils/DeploymentsTools";

require("./wave.1/deploy:wave1:yakisoba");
require("./wave.1/deploy:wave1:allocator");
require("./wave.1/deploy:wave1:bridge");
require("./wave.1/deploy:wave1:elb");
require("./wave.1/deploy:wave1:strategyMock");

task("deploy:wave1", "Deploys the home chain contracts")
  .addParam("deployment", "The deployment to run (production, alpha, staging)")
  .addParam("local", "Whether to deploy locally or not")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;
    const deploy: string = taskArgs.deployment;
    const { getConstantsMock, getHomeChainId } = DeploymentTools;
    const { a, p } = getConstantsMock(deploy, "home_chain_id");
    const local = taskArgs.local == "true" ? true : false;
    assert(
      taskArgs.deployment == "alpha" ||
        taskArgs.deployment == "staging" ||
        taskArgs.deployment == "production",
      "invalid step"
    );

    const deployer: Wallet = await getDeployerWallet(ethers.provider);
    const network = getHomeChainId(hre, deploy);

    console.log("Deploying contracts with the account:", deployer.address);

    console.log(
      "Account native balance:",
      ethers.utils.formatEther(
        await ethers.provider.getBalance(deployer.address)
      )
    );

    const homeChainId = p.home_chain_id;
    const usdc = a.usdc;
    const usdcAbi: any = JSON.parse(
      fs.readFileSync("tasks/deployMock/USDCMockStg.json").toString()
    );

    const usdcToken: Contract = new ethers.Contract(usdc, usdcAbi, deployer);

    const usdcBalance: BigNumber = await usdcToken.balanceOf(deployer.address);

    console.log(
      "USDC balance:",
      (await usdcToken.balanceOf(deployer.address)).toString()
    );

    console.log("Deploying wave 1");

    console.log("Deploying Allocator...");
    await hre.run("deploy:wave1:allocator", {
      deployment: deploy,
      network: network,
      local: taskArgs.local,
    });

    console.log("Deploying Yakisoba...");
    await hre.run("deploy:wave1:yakisoba", {
      deployment: deploy,
      network: network,
      local: taskArgs.local,
    });

    console.log("Deploying BridgeConnectorHomeSTG...");
    await hre.run("deploy:wave1:bridge", {
      deployment: deploy,
      network: network,
      local: taskArgs.local,
    });

    console.log("Deploying StrategyOne...");
    await hre.run("deploy:wave1:strategyMock", {
      deployment: deploy,
      network: network,
      local: taskArgs.local,
    });

    // No aave on staging
    if (deploy != "staging") {
      console.log("Deploying Liquidity pool...");
      await hre.run("deploy:wave1:elb", {
        deployment: deploy,
        network: network,
        local: taskArgs.local,
      });
    }
    console.log("Wave 1 deployed");
  });

export {};
