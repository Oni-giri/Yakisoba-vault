import { task } from "hardhat/config";
import { BigNumber, Contract, utils, Wallet } from "ethers";
import * as fs from "fs";
import { getDeployerWallet } from "../../utils/networks";
import { assert } from "console";
import DeploymentsTools from "../../utils/DeploymentsTools";
import { Params } from "../../utils/types";

require("./wave.3/deploy:wave3:setup");
require("./wave.3/deploy:wave3:save");

task("deploy:wave3", "Deploys the home chain contracts")
  .addParam("deployment", "The deployment to run (production, alpha, staging)")
  .addParam("local", "Whether to deploy locally or not")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;
    const deploy: string = taskArgs.deployment;
    const local: boolean = taskArgs.local == "true" ? true : false;
    const getConstantsMock = DeploymentsTools.getConstantsMock;

    //NOTE - How to specify types when unpacking
    const { a, p } = getConstantsMock(deploy, "home_chain_id");

    assert(
      taskArgs.deployment == "alpha" ||
        taskArgs.deployment == "staging" ||
        taskArgs.deployment == "production",
      "invalid step"
    );

    const deployer: Wallet = await getDeployerWallet(ethers.provider);
    const network = taskArgs.local ? "localhost" : p.home_chain_name;

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
    console.log("USDC balance:", usdcBalance.toString());

    console.log(
      "USDC balance:",
      (await usdcToken.balanceOf(deployer.address)).toString()
    );

    if (usdcBalance < ethers.utils.parseUnits("10000", 18)) {
      usdcToken.mint(deployer.address, ethers.utils.parseUnits("10000", 18));
    }

    console.log("Deploying wave 3");

    console.log("Seting contracts...");
    await hre.run("deploy:wave3:setup", {
      deployment: deploy,
      local: taskArgs.local,
      network: network,
    });

    // We don't save the contracts if we are deploying locally

    console.log("Saving contracts...");
    await hre.run("deploy:wave3:save", {
      deployment: deploy,
      network: network,
      local: taskArgs.local,
    });
    console.log("Wave 3 deployed");
  });

export {};
