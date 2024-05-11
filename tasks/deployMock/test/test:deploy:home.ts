import { task } from "hardhat/config";
const { expect } = require("chai");
import DeploymentTools from "../../../utils/DeploymentsTools";
import fs from "fs";

import { DeployParams } from "../../../utils/types";

import { getDeployerWallet } from "../../../utils/networks";
import { Yakisoba } from "../../../typechain-types";
import { BigNumber, Contract, ContractFactory, utils, Wallet } from "ethers";
import { deploy } from "@openzeppelin/hardhat-upgrades/dist/utils";

task("test:deploy:home", "Tests the deployment's homechain setup")
  .addParam("deployment", "The deployment to run (production, alpha, staging)")
  .addParam("local", "If we are deploying on the local network")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    const deployer: Wallet = await getDeployerWallet(ethers.provider);
    const { getConstantsMock, getDeployedContract } = DeploymentTools;

    const deploy: string = taskArgs.deployment;
    const local: boolean = taskArgs.local == "true" ? true : false;

    const { a, p } = getConstantsMock(deploy, "home_chain_id");

    const homeChainId = p.home_chain_id;
    const remoteChainId: number = p.remote_chain_id;
    const usdc = a.usdc;

    const deployParams: DeployParams = {
      deploy: deploy,
      local: local,
      provider: deployer,
      chainId: homeChainId,
    };

    const yakisoba: Yakisoba = (await getDeployedContract(
      "Yakisoba",
      deployParams
    )) as Yakisoba;

    const homeBridge: Contract = await getDeployedContract(
      "BridgeConnectorHomeSTG",
      deployParams
    );

    const homeAllocator: Contract = await getDeployedContract(
      "Allocator",
      deployParams
    );
    const strategyOneHome: Contract = await getDeployedContract(
      "StrategyOneHome",
      deployParams
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

    const decimals: number = await usdcToken.decimals();

    // We check that we have the correct asset
    expect(await yakisoba.asset()).to.be.equal(usdc);

    // We check that the share price is OK
    expect(await yakisoba.sharePrice()).to.be.equal(
      ethers.utils.parseUnits("1", decimals)
    );
    expect(await yakisoba.decimals()).to.be.equal(decimals);
    expect(await homeAllocator.asset()).to.be.equal(usdc);
    expect(await homeBridge.asset()).to.be.equal(usdc);

    if (deploy != "staging") {
      const swap: Contract = await getDeployedContract("Swap", deployParams);
      expect(await swap.UNDERLYING_TOKENS(1)).to.be.equal(usdc);
      expect(await swap.UNDERLYING_TOKENS(0)).to.be.equal(
        ethers.constants.AddressZero
      );
      expect(await swap.getPooledToken(1)).to.be.equal(a.aave_usdc);
      expect(await swap.getPooledToken(0)).to.be.equal(
        ethers.constants.AddressZero
      );
    }

    console.log("Asset config ✅");

    // We check that the bridge is correctly configured on the yakisoba
    const chainDataRemote: any = await yakisoba.chainData(p.remote_chain_id);
    const chainListRemote: any = await yakisoba.chainList(1);

    expect(chainDataRemote[1]).to.be.equal(ethers.constants.MaxUint256);
    expect(chainDataRemote[2]).to.be.equal(homeBridge.address);
    expect(chainListRemote).to.be.equal(remoteChainId);

    const chainDataHome: any = await yakisoba.chainData(homeChainId);
    const chainListHome: any = await yakisoba.chainList(0);
    expect(chainDataHome[1]).to.be.equal(ethers.constants.MaxUint256);
    expect(chainDataHome[2]).to.be.equal(homeAllocator.address);
    expect(chainListHome).to.be.equal(homeChainId);

    expect(await homeAllocator.bridgeConnector()).to.be.equal(yakisoba.address);

    // checking that the homebridge is correctly configured
    expect(await homeBridge.yakisoba()).to.be.equal(yakisoba.address);
    expect(await homeBridge.stgEndpoint()).to.be.equal(a.stg_router);
    // TODO: check for lz endpoint
    expect(await homeBridge.srcPoolId()).to.be.equal(p.homeSrcPoolId);
    expect(await homeBridge.dstPoolIdMap(p.remote_chain_id)).to.be.equal(
      p.remoteSrcPoolId
    );
    console.log("Bridge config ✅");

    // We try some interactions
    expect(
      (
        await yakisoba.estimateDispatchCost(
          [homeChainId],
          [ethers.utils.parseUnits("1", decimals)]
        )
      ).toString()
    ).to.be.equal([ethers.constants.Zero].toString());

    const estimateFee = await yakisoba.estimateDispatchCost(
      [p.remote_chain_id],
      [ethers.utils.parseUnits("1", decimals)]
    );

    expect(estimateFee[0]).to.be.gt(0);
    console.log("Estimate fee ✅");

    const amount = ethers.utils.parseUnits("1", decimals - 2);

    // We deposit some assets
    await yakisoba.deposit(
      ethers.utils.parseUnits("10", await yakisoba.decimals()),
      deployer.address
    );

    // We dispatch to the remote chain
    await yakisoba.dispatchAssets(
      [amount],
      [amount.mul(99).div(100)],
      [p.remote_chain_id],
      [estimateFee[0]],
      [ethers.constants.HashZero],
      {
        value: estimateFee[0],
      }
    );
    console.log("Dispatch assets to remote ✅");

    // We dispatch to the home chain
    await yakisoba.dispatchAssets(
      [amount],
      [amount],
      [homeChainId],
      [0],
      [ethers.constants.HashZero]
    );

    console.log("Dispatch assets to home ✅");

    const allocatorBal: BigNumber = await usdcToken.balanceOf(
      homeAllocator.address
    );

    expect(allocatorBal).to.be.equal(amount);

    await homeAllocator.dispatchAssets(
      [allocatorBal],
      [strategyOneHome.address]
    );

    const strategyBal: BigNumber = await usdcToken.balanceOf(
      strategyOneHome.address
    );

    expect(strategyBal).to.be.equal(allocatorBal);

    console.log("Dispatch assets to strategy ✅");

    console.log("All tests passed ✅");
  });
