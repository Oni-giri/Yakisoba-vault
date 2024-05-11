const { expect } = require("chai");

import * as fxt from "../utils/fixtures";

import { BigNumber, Contract } from "ethers";
import { ethers, upgrades, testUtils } from "hardhat";
const { block, time } = testUtils;

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import a from "../utils/mainnet-adresses";
import assert from "assert";
import params from "../utils/params";

describe("test.yakisoba.getters", function () {
  beforeEach(async function () {
    this.deployer = await fxt.getDeployer();

    this.yakisoba = await fxt.deployYakisoba(this.deployer);
    await this.yakisoba.setFees(0, 0, 0);
    this.usdc = await fxt.getUSDCToken(this.deployer);
    await fxt.getUSDC(this.deployer);
    this.decimals = await this.usdc.decimals();
    this.alice = await fxt.getAlice();
    await this.yakisoba.unpause();
    await this.yakisoba.setMaxTotalAssets(ethers.constants.MaxUint256);
    expect(await this.yakisoba.totalAssets()).to.equal(params.seed_deposit);
  });

  it("Preview deposit - no swap", async function () {
    expect((await this.yakisoba.liquidityPoolEnabled()) == false);
    expect(await this.yakisoba.previewDeposit(params.seed_deposit)).to.equal(
      params.seed_deposit
    );

    const sharePriceBefore: BigNumber = await this.yakisoba.sharePrice();

    this.usdc.transfer(this.yakisoba.address, params.seed_deposit);
    expect(await this.yakisoba.sharePrice()).to.equal(sharePriceBefore.mul(2));

    expect(await this.yakisoba.previewDeposit(params.seed_deposit)).to.equal(
      params.seed_deposit.div(2)
    );

    const previewDeposit = await this.yakisoba.previewDeposit(params.seed_deposit);

    expect(
      await this.yakisoba.callStatic.deposit(
        params.seed_deposit,
        this.deployer.address
      )
    ).to.be.equal(previewDeposit);
  });

  it("Preview deposit - with swap", async function () {
    this.swap = await fxt.deploySwap(this.deployer, this.yakisoba);
    await expect(
      this.yakisoba.migrateLiquidityPool(this.swap.address, params.seed_deposit)
    ).not.to.be.reverted;

    expect((await this.yakisoba.liquidityPoolEnabled()) == true);
    expect(await this.yakisoba.previewDeposit(params.seed_deposit)).to.be.at.least(
      params.seed_deposit.sub(1)
    );

    await this.yakisoba.withdraw(
      params.seed_deposit,
      this.deployer.address,
      this.deployer.address
    );
    expect(
      await this.yakisoba.previewDeposit(params.seed_deposit)
    ).to.be.greaterThan(params.seed_deposit);

    const previewDeposit = await this.yakisoba.previewDeposit(params.seed_deposit);

    expect(
      await this.yakisoba.callStatic.deposit(
        params.seed_deposit,
        this.deployer.address
      )
    ).to.be.at.least(previewDeposit.sub(1));
  });

  it("Preview mint", async function () {
    expect(await this.yakisoba.previewMint(params.seed_deposit)).to.equal(
      params.seed_deposit
    );
    await this.yakisoba.mint(params.seed_deposit, this.alice.address);
    expect(await this.yakisoba.previewMint(params.seed_deposit)).to.equal(
      params.seed_deposit
    );

    await this.usdc.transfer(this.yakisoba.address, params.seed_deposit.mul(2));
    expect(await this.yakisoba.previewMint(params.seed_deposit)).to.equal(
      params.seed_deposit.mul(2)
    );

    const previewMint = await this.yakisoba.previewMint(params.seed_deposit);

    expect(
      await this.yakisoba.callStatic.mint(
        params.seed_deposit,
        this.deployer.address
      )
    ).to.be.equal(previewMint);
  });

  it("Preview withdraw", async function () {
    expect((await this.yakisoba.liquidityPoolEnabled()) == false);
    expect(await this.yakisoba.previewWithdraw(params.seed_deposit)).to.equal(
      params.seed_deposit
    );

    const sharePriceBefore: BigNumber = await this.yakisoba.sharePrice();

    this.usdc.transfer(this.yakisoba.address, params.seed_deposit);
    expect(await this.yakisoba.sharePrice()).to.equal(sharePriceBefore.mul(2));

    expect(await this.yakisoba.previewWithdraw(params.seed_deposit)).to.equal(
      params.seed_deposit.div(2)
    );

    this.yakisoba.setFees(0, 0, 50);
    expect(await this.yakisoba.withdrawFee()).to.equal(50);

    expect(await this.yakisoba.previewWithdraw(params.seed_deposit)).to.equal(
      params.seed_deposit
        .mul(10000)
        .div(10000 - 50)
        .div(2)
    );

    const previewWithdraw = await this.yakisoba.previewWithdraw(
      params.seed_deposit
    );

    expect(
      await this.yakisoba.callStatic.withdraw(
        params.seed_deposit,
        this.deployer.address,
        this.deployer.address
      )
    ).to.be.equal(previewWithdraw);
  });

  it("Preview redeem - no swap", async function () {
    expect((await this.yakisoba.liquidityPoolEnabled()) == false);
    expect(await this.yakisoba.previewRedeem(params.seed_deposit)).to.equal(
      params.seed_deposit
    );

    const sharePriceBefore: BigNumber = await this.yakisoba.sharePrice();

    this.usdc.transfer(this.yakisoba.address, params.seed_deposit);
    expect(await this.yakisoba.sharePrice()).to.equal(sharePriceBefore.mul(2));

    expect(await this.yakisoba.previewRedeem(params.seed_deposit.div(2))).to.equal(
      params.seed_deposit
    );

    this.yakisoba.setFees(0, 0, 50);
    expect(await this.yakisoba.withdrawFee()).to.equal(50);

    expect(await this.yakisoba.previewRedeem(params.seed_deposit.div(2))).to.equal(
      params.seed_deposit.mul(9950).div(10000)
    );

    expect(
      await this.yakisoba.previewRedeem(params.seed_deposit.mul(100))
    ).to.equal(0);

    const previewRedeem = await this.yakisoba.previewRedeem(
      params.seed_deposit.div(2)
    );

    expect(
      await this.yakisoba.callStatic.redeem(
        params.seed_deposit.div(2),
        this.deployer.address,
        this.deployer.address
      )
    ).to.be.equal(previewRedeem);
  });

  it("Preview redeem - with swap, enough in yakisoba", async function () {
    expect(await this.yakisoba.previewRedeem(params.seed_deposit)).to.equal(
      params.seed_deposit
    );

    this.swap = await fxt.deploySwap(this.deployer, this.yakisoba);
    await expect(
      this.yakisoba.migrateLiquidityPool(this.swap.address, params.seed_deposit)
    ).not.to.be.reverted;

    this.yakisoba.setFees(0, 0, 50);
    expect(await this.yakisoba.withdrawFee()).to.equal(50);

    expect((await this.yakisoba.liquidityPoolEnabled()) == true);

    // We add some funds to the yakisoba to make sure the previewRedeem is not just returning the balance
    await this.usdc.transfer(this.yakisoba.address, params.seed_deposit.mul(5));
    const toRedeem = (await this.yakisoba.balanceOf(this.deployer.address)).div(6);

    // We make sure the amount to redeem is less than the balance of the yakisoba
    expect(await this.yakisoba.convertToAssets(toRedeem)).to.be.lessThan(
      await this.usdc.balanceOf(this.yakisoba.address)
    );
    const estimation = await this.yakisoba.previewRedeem(toRedeem);
    console.log("estimation", estimation);

    expect(
      await this.yakisoba.callStatic.redeem(
        toRedeem,
        this.deployer.address,
        this.deployer.address
      )
    ).to.be.within(estimation.sub(2), estimation.add(2));
  });

  it("Preview redeem - with swap, not enough in yakisoba", async function () {
    expect(await this.yakisoba.previewRedeem(params.seed_deposit)).to.equal(
      params.seed_deposit
    );

    this.swap = await fxt.deploySwap(this.deployer, this.yakisoba);
    await expect(
      this.yakisoba.migrateLiquidityPool(this.swap.address, params.seed_deposit)
    ).not.to.be.reverted;

    this.yakisoba.setFees(0, 0, 50);
    expect(await this.yakisoba.withdrawFee()).to.equal(50);

    expect((await this.yakisoba.liquidityPoolEnabled()) == true);
    expect(await this.yakisoba.previewRedeem(params.seed_deposit)).to.be.lessThan(
      params.seed_deposit.mul(9950).div(10000)
    );

    expect(await this.yakisoba.previewRedeem(params.seed_deposit)).to.be.lessThan(
      params.seed_deposit.mul(9950).div(10000)
    );

    // We add some funds to the yakisoba to make sure the previewRedeem is not just returning the balance
    await this.usdc.transfer(this.yakisoba.address, params.seed_deposit.div(10));

    const toRedeem = (await this.yakisoba.balanceOf(this.deployer.address)).div(2);

    const estimation = await this.yakisoba.previewRedeem(toRedeem);

    expect(
      await this.yakisoba.callStatic.redeem(
        toRedeem,
        this.deployer.address,
        this.deployer.address
      )
    ).to.be.equal(estimation);

    await this.yakisoba.redeem(
      toRedeem,
      this.deployer.address,
      this.deployer.address
    );

    expect(await this.yakisoba.previewRedeem(toRedeem)).to.be.lessThan(estimation);
  });

  it("maxWithdraw", async function () {
    expect(await this.yakisoba.paused()).to.equal(false);
    expect(await this.yakisoba.maxWithdraw(this.deployer.address)).to.equal(
      await this.yakisoba.balanceOf(this.deployer.address)
    );
    expect(await this.yakisoba.maxWithdraw(this.deployer.address)).to.equal(
      params.seed_deposit
    );
    await this.yakisoba.pause();
    expect(await this.yakisoba.paused()).to.equal(true);
    expect(await this.yakisoba.maxWithdraw(this.deployer.address)).to.equal(0);
  });

  it("maxRedeem", async function () {
    expect(await this.yakisoba.paused()).to.equal(false);
    expect(await this.yakisoba.maxRedeem(this.deployer.address)).to.equal(
      await this.yakisoba.balanceOf(this.deployer.address)
    );
    expect(await this.yakisoba.maxRedeem(this.deployer.address)).to.equal(
      params.seed_deposit
    );
    await this.yakisoba.pause();
    expect(await this.yakisoba.paused()).to.equal(true);
    expect(await this.yakisoba.maxRedeem(this.deployer.address)).to.equal(0);
  });

  it("Converts to assets if supply is = 0", async function () {
    this.yakisoba = await fxt.deployYakisoba(this.deployer);

    expect(await this.yakisoba.totalSupply()).to.equal(0);
    expect(await this.yakisoba.convertToAssets(params.seed_deposit)).to.equal(
      params.seed_deposit
    );
  });
});
