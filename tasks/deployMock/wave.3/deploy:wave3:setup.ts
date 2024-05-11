import { task } from "hardhat/config";

import { Deployment, DeployParams } from "../../../utils/types";
import DeploymentTools from "../../../utils/DeploymentsTools";
import fs from "fs";

import { getDeployerWallet } from "../../../utils/networks";

import { AbiCoder } from "ethers/lib/utils";
import { Yakisoba } from "../../../typechain-types";
import { BigNumber, Contract, Wallet } from "ethers";
import { deploy } from "@openzeppelin/hardhat-upgrades/dist/utils";

task("deploy:wave3:setup", "Deploys the Yakisoba contract")
  .addParam("deployment", "The deployment to run (production, alpha, staging)")
  .addParam("local", "If we are deploying on the local network")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    const deployer: Wallet = await getDeployerWallet(ethers.provider);
    const {
      getDeployment,
      getConstantsMock,
      getDeployedContract,
      sleep,
      getHomeChainId,
    } = DeploymentTools;

    const deploy: string = taskArgs.deployment;
    const local: boolean = taskArgs.local == "true" ? true : false;

    const { a, p } = getConstantsMock(deploy, "home_chain_id");
    const homeChainId = getHomeChainId(hre, deploy);

    const remoteChainId: number = p.remote_chain_id;
    const usdc = a.usdc;

    const deployParamsHome: DeployParams = {
      provider: deployer,
      chainId: homeChainId,
      deploy: deploy,
      local: local,
    };

    const deployParamsRemote: DeployParams = {
      provider: deployer,
      chainId: remoteChainId,
      deploy: deploy,
      local: local,
    };

    const yakisoba: Yakisoba = (await getDeployedContract(
      "Yakisoba",
      deployParamsHome
    )) as Yakisoba;

    const homeBridge: Contract = await getDeployedContract(
      "BridgeConnectorHomeSTG",
      deployParamsHome
    );

    const remoteAllocator: Contract = await getDeployedContract(
      "Allocator",
      deployParamsRemote
    );
    const remoteBridge: Contract = await getDeployedContract(
      "BridgeConnectorRemoteSTG",
      deployParamsRemote
    );
    const homeAllocator: Contract = await getDeployedContract(
      "Allocator",
      deployParamsHome
    );
    const strategyOneHome: Contract = await getDeployedContract(
      "StrategyOneHome",
      deployParamsHome
    );

    const usdcAbi: any = JSON.parse(
      fs.readFileSync("tasks/deployMock/USDCMockStg.json").toString()
    );

    // We load the USDC token contract
    const usdcToken: Contract = await new ethers.Contract(
      usdc,
      usdcAbi,
      deployer
    );

    console.log(
      "yakisoba balance: ",
      ethers.utils
        .formatUnits(
          await usdcToken.balanceOf(yakisoba.address),
          await yakisoba.decimals()
        )
        .toString()
    );

    // We give the approval to the yakisoba to spend our USDC
    console.log("Approving USDC for the yakisoba");
    const allowance: BigNumber = await usdcToken.allowance(
      deployer.address,
      yakisoba.address
    );

    await usdcToken.approve(yakisoba.address, ethers.constants.MaxUint256);
    // Sleep to wait for the tx to process
    local ? null : await sleep(15000);

    if (await yakisoba.paused()) {
      console.log("Unpausing the yakisoba");
      await yakisoba.unpause();
      local ? null : await sleep(15000);
    } else {
      console.log("Yakisoba already unpaused");
    }

    // This increase the max TVL of the yakisoba
    // It also deposits the USDC in the yakisoba for safety/math reasons
    console.log("Setting max TVL for the yakisoba");
    const maxTotalAssets: BigNumber = await yakisoba.maxTotalAssets();

    if (maxTotalAssets < ethers.constants.MaxUint256) {
      await yakisoba.setMaxTotalAssets(ethers.constants.MaxUint256);
      local ? null : await sleep(15000);
    } else {
      console.log("Max TVL already set");
    }
    console.log(
      "yakisoba usdc balance: ",
      await usdcToken.balanceOf(yakisoba.address)
    );
    // We set the bridge address in the allocator
    console.log("Setting bridge address in the allocator");

    const bridge: string = await homeAllocator.bridgeConnector();

    if (bridge == ethers.constants.AddressZero) {
      await homeAllocator.setBridge(yakisoba.address);
      local ? null : await sleep(15000);
    } else {
      console.log("Bridge already set");
    }

    // We add the strategy to the allocator
    console.log("Adding strategy to the allocator");

    const strategyList: any = await homeAllocator.strategiesData(
      strategyOneHome.address
    );
    if (strategyList[0] == "") {
      await homeAllocator.addNewStrategy(
        strategyOneHome.address,
        ethers.constants.MaxUint256,
        "Strategy Local"
      );
      local ? null : await sleep(15000);
    } else {
      console.log("Strategy already added");
    }

    // We add the chain to the yakisoba
    console.log("Adding local chain to the yakisoba");

    const homeChain: any = await yakisoba.chainData(homeChainId);

    if (homeChain[2] == ethers.constants.AddressZero) {
      await yakisoba.addChain(
        homeChainId,
        ethers.constants.MaxUint256,
        homeAllocator.address,
        homeAllocator.address,
        homeAllocator.address,
        ethers.constants.HashZero
      );
      local ? null : await sleep(15000);
    } else {
      console.log("Home chain already added");
    }

    const coder: AbiCoder = new ethers.utils.AbiCoder();
    const bytesParams: string = coder.encode(
      ["uint256", "uint16"],
      [p.lz_remote_chain_id, ethers.BigNumber.from(p.remoteSrcPoolId)]
    );

    // We add the remote chain to the yakisoba
    console.log("Adding remote chain to the yakisoba");

    const remoteChain = await yakisoba.chainData(
      ethers.BigNumber.from(remoteChainId)
    );

    if (remoteChain[2] == ethers.constants.AddressZero) {
      await yakisoba.addChain(
        p.remote_chain_id,
        ethers.constants.MaxUint256,
        homeBridge.address,
        remoteAllocator.address,
        remoteBridge.address,
        bytesParams
      );
    } else {
      console.log("Remote chain already added");
    }

    const swapStruct = await yakisoba.liquidityPool();

    if (swapStruct[2] != ethers.constants.AddressZero) {
      console.log("Swap already set");
    } else if (deploy != "staging") {
      // We add the elb to the yakisoba
      console.log("Adding elb to the yakisoba");
      const decimals = await yakisoba.decimals(); // USDC decimals should be the same
      const seedAmount = ethers.utils.parseUnits(p.seed_deposit, decimals);
      const usdcBalance = await usdcToken.balanceOf(deployer.address);
      console.log("USDC Decimals", decimals);
      console.log(
        "USDC balance",
        ethers.utils.formatUnits(usdcBalance.toString(), decimals).toString()
      );

      console.log(
        usdcBalance >= seedAmount ? "Enough USDC" : "Not enough USDC"
      );

      if ((await usdcToken.balanceOf(yakisoba.address)) < seedAmount) {
        console.log("Depositing USDC");
        await yakisoba.deposit(seedAmount, deployer.address);
        console.log("USDC deposited");
      }

      console.log("Migrating ELB");
      const swap: Deployment = await getDeployment(
        deploy,
        homeChainId,
        "Swap",
        local
      );
      console.log(
        "Yakisoba balance",
        ethers.utils.formatUnits(
          await usdcToken.balanceOf(yakisoba.address),
          decimals
        )
      );
      await yakisoba.migrateLiquidityPool(swap.address, seedAmount);
      console.log("Elb added");
    }

    console.log("Home setup done");
  });
