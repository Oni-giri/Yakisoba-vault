const { expect } = require("chai");

import * as fxt from "../utils/fixtures";

import { BigNumber, Contract } from "ethers";
import { ethers, upgrades, testUtils } from "hardhat";
const { block, time } = testUtils;

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import a from "../utils/mainnet-adresses";
import assert from "assert";
import params from "../utils/params";

describe("test.yakisoba.utils", function () {
  beforeEach(async function () {
    this.deployer = await fxt.getDeployer();

    this.yakisoba = await fxt.deployYakisoba(this.deployer);
    this.usdc = await fxt.getUSDCToken(this.deployer);
    await fxt.getUSDC(this.deployer);
    this.decimals = await this.usdc.decimals();
    this.alice = await fxt.getAlice();
    await this.yakisoba.unpause();
    await this.yakisoba.setMaxTotalAssets(ethers.constants.MaxUint256);
  });

  describe("Snapshot", function () {
    it("Makes snapshot", async function () {
      const id: BigNumber = await this.yakisoba.callStatic.snapshot();
      expect(id).to.equal(1);
    });

    it("Retrieves balance at snapshot", async function () {
      await this.yakisoba.snapshot();
      const balance: BigNumber = await this.yakisoba.callStatic.balanceOfAt(
        this.deployer.address,
        1
      );
      expect(balance).to.equal(params.seed_deposit);
      // Deployer has 100 crUSDC
      await this.yakisoba.mint(
        ethers.utils.parseUnits("100", this.decimals),
        this.deployer.address
      );
      // Deployer has 200 crUSDC

      const balance2: BigNumber = await this.yakisoba.callStatic.balanceOfAt(
        this.deployer.address,
        1
      );
      expect(balance2).to.equal(params.seed_deposit);

      await this.yakisoba.snapshot();
      const balance3: BigNumber = await this.yakisoba.callStatic.balanceOfAt(
        this.deployer.address,
        2
      );
      expect(balance3).to.equal(
        ethers.utils.parseUnits("100", this.decimals).add(params.seed_deposit)
      );

      await this.yakisoba.mint(
        ethers.utils.parseUnits("100", this.decimals),
        this.alice.address
      );
      // Alice has 100 crUSDC

      const balance4: BigNumber = await this.yakisoba.callStatic.balanceOfAt(
        this.deployer.address,
        2
      );
      expect(balance4).to.equal(
        ethers.utils.parseUnits("100", this.decimals).add(params.seed_deposit)
      );

      const balance5: BigNumber = await this.yakisoba.callStatic.balanceOfAt(
        this.alice.address,
        2
      );

      expect(balance5).to.equal(0);

      this.yakisoba.transfer(
        this.alice.address,
        ethers.utils.parseUnits("100", this.decimals)
      );
      // Alice has 200 crUSDC
      // Deployer has 100 crUSDC
      const actualBalance: BigNumber = await this.yakisoba.balanceOf(
        this.deployer.address
      );
      await this.yakisoba.snapshot();

      const balance6: BigNumber = await this.yakisoba.callStatic.balanceOfAt(
        this.deployer.address,
        3
      );

      expect(balance6).to.equal(actualBalance);
      const balance7: BigNumber = await this.yakisoba.callStatic.balanceOfAt(
        this.alice.address,
        3
      );
      expect(balance7).to.equal(
        ethers.utils.parseUnits("100", this.decimals).add(params.seed_deposit)
      );

      await this.yakisoba.redeem(
        ethers.utils.parseUnits("100", this.decimals),
        this.deployer.address,
        this.deployer.address
      );

      // Deployer has 0 crUSDC
      // Alice has 200 crUSDC
      await expect(
        await this.yakisoba.balanceOf(this.deployer.address)
      ).to.be.equal(0);

      await this.yakisoba.snapshot();

      const balance8: BigNumber = await this.yakisoba.callStatic.balanceOfAt(
        this.deployer.address,
        4
      );
      expect(balance8).to.equal(0);
    });

    it("Reverts if the caller is not the owner", async function () {
      await expect(
        this.yakisoba.connect(this.alice).snapshot()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Rescue token", function () {
    it("Rescues token", async function () {
      const token = await fxt.deployMockERC20(
        this.deployer,
        "mock",
        "MCK",
        ethers.utils.parseEther("100")
      );

      await token.transfer(this.yakisoba.address, ethers.utils.parseEther("100"));
      expect(await token.balanceOf(this.yakisoba.address)).to.be.equal(
        ethers.utils.parseEther("100")
      );
      await expect(this.yakisoba.rescueToken(token.address, false)).not.to.be
        .reverted;
      const balance = await token.balanceOf(this.deployer.address);
      expect(balance).to.equal(ethers.utils.parseEther("100"));
    });

    it("Reverts if we want to rescue the asset token", async function () {
      await expect(this.yakisoba.rescueToken(await this.yakisoba.asset(), false)).to
        .be.reverted;
    });

    it("Reverts if the caller is not the owner", async function () {
      const token = await fxt.deployMockERC20(
        this.deployer,
        "mock",
        "MCK",
        ethers.utils.parseEther("100")
      );
      await token.transfer(this.yakisoba.address, ethers.utils.parseEther("100"));
      await expect(
        this.yakisoba.connect(this.alice).rescueToken(token.address, false)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Rescues the ETH", async function () {
      const token = await fxt.deployMockERC20(
        this.deployer,
        "mock",
        "MCK",
        ethers.utils.parseEther("100")
      );

      const tx = {
        to: this.yakisoba.address,
        value: ethers.utils.parseEther("1"),
      };

      await this.deployer.sendTransaction(tx);
      const deployerBalance = await this.deployer.getBalance();

      const provider = await ethers.provider;
      const ethBalance = await provider.getBalance(this.yakisoba.address);

      await expect(this.yakisoba.rescueToken(ethers.constants.AddressZero, true))
        .not.to.be.reverted;

      expect(await provider.getBalance(this.yakisoba.address)).to.be.equal(0);
      expect(await this.deployer.getBalance()).to.be.greaterThan(
        deployerBalance
      );
    });
  });

  describe("Fees", function () {
    const mgmtFee: number = 500;
    const perfFee: number = 500;
    const withdrawFee: number = 50;

    it("Sets fees", async function () {
      expect(await this.yakisoba.performanceFee()).to.be.equal(
        params.performance_fee
      );
      expect(await this.yakisoba.managementFee()).to.be.equal(
        params.management_fee
      );
      expect(await this.yakisoba.withdrawFee()).to.be.equal(params.withdraw_fee);

      await expect(this.yakisoba.setFees(perfFee, mgmtFee, withdrawFee)).not.to.be
        .reverted;

      expect(await this.yakisoba.performanceFee()).to.be.equal(perfFee);
      expect(await this.yakisoba.managementFee()).to.be.equal(mgmtFee);
      expect(await this.yakisoba.withdrawFee()).to.be.equal(withdrawFee);
    });

    it("Reverts if the caller is not the owner", async function () {
      await expect(
        this.yakisoba.connect(this.alice).setFees(perfFee, mgmtFee, withdrawFee)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Reverts if fees are too high", async function () {
      await expect(
        this.yakisoba.setFees(11000, 0, 0)
      ).to.be.revertedWithCustomError(this.yakisoba, "FeeError");
      await expect(
        this.yakisoba.setFees(0, 11000, 0)
      ).to.be.revertedWithCustomError(this.yakisoba, "FeeError");
      await expect(
        this.yakisoba.setFees(0, 0, 11000)
      ).to.be.revertedWithCustomError(this.yakisoba, "FeeError");
    });

    it("Emits event when fees are set", async function () {
      await expect(this.yakisoba.setFees(mgmtFee, perfFee, withdrawFee))
        .to.emit(this.yakisoba, "NewFees")
        .withArgs(perfFee, mgmtFee, withdrawFee);
    });

    it("Computes performance fees", async function () {
      const firstCheckpoint = await this.yakisoba.checkpoint();
      expect(firstCheckpoint[1]).to.be.equal(await this.yakisoba.sharePrice());
      await this.yakisoba.setFees(perfFee, 0, 0);
      await this.yakisoba.mint(params.seed_deposit, this.alice.address);

      const assetBalanceBefore = await this.usdc.balanceOf(this.yakisoba.address);
      const sharePriceBefore = await this.yakisoba.sharePrice();
      expect(sharePriceBefore).to.be.equal(
        ethers.utils.parseUnits("1", this.decimals)
      );
      const feesBefore = await this.yakisoba.computeFees();
      expect(feesBefore[0]).to.be.equal(0);

      // We need to transfer some USDC to the yakisoba
      await this.usdc.transfer(this.yakisoba.address, params.seed_deposit);

      // Fees are = to
      // ((sharePrice - sharePriceBefore) * 1000 / 10000) * assetBalanceBefore
      // / sharePriceBefore
      const estimatedFees = (await this.yakisoba.sharePrice())
        .sub(sharePriceBefore)
        .mul(perfFee)
        .div(10000)
        .mul(assetBalanceBefore)
        .div(sharePriceBefore);

      const fees = await this.yakisoba.computeFees();
      expect(fees[0]).to.be.equal(estimatedFees);
    });

    it("Computes management fees", async function () {
      const firstCheckpoint = await this.yakisoba.checkpoint();
      expect(firstCheckpoint[1]).to.be.equal(await this.yakisoba.sharePrice());
      await this.yakisoba.setFees(0, mgmtFee, 0);
      await this.yakisoba.mint(params.seed_deposit, this.alice.address);
      const sharePrice: BigNumber = await this.yakisoba.sharePrice();
      // We disable automine to simulate transactions sent in the same block
      await block.setAutomine(false);
      await this.yakisoba.takeFees();
      await this.usdc.transfer(this.yakisoba.address, params.seed_deposit);
      const fees = await this.yakisoba.computeFees();
      expect(fees[1]).to.be.equal(0);
      await block.setAutomine(true);

      // We try to compute fees after 1 year
      await time.increase(86400 * 365);
      const totalAssets: BigNumber = await this.yakisoba.totalAssets();
      const sharePrice2: BigNumber = await this.yakisoba.sharePrice();
      const gain: BigNumber = sharePrice2.sub(sharePrice);
      const fees2 = await this.yakisoba.computeFees();
      expect(fees2[1]).to.be.within(
        totalAssets.mul(mgmtFee).div(10000),
        totalAssets.mul(mgmtFee).div(10000).add(10000) // 10000 is the error margin due to time
      );
    });

    it("Takes perfomance fees", async function () {
      const firstCheckpoint = await this.yakisoba.checkpoint();
      expect(firstCheckpoint[1]).to.be.equal(await this.yakisoba.sharePrice());
      await this.yakisoba.setFees(perfFee, 0, 0);
      await this.yakisoba.mint(params.seed_deposit, this.alice.address);

      const sharePriceBefore = await this.yakisoba.sharePrice();
      expect(sharePriceBefore).to.be.equal(
        ethers.utils.parseUnits("1", this.decimals)
      );
      const feesBefore = await this.yakisoba.computeFees();
      expect(feesBefore[0]).to.be.equal(0);

      // We need to transfer some USDC to the yakisoba
      await this.usdc.transfer(this.yakisoba.address, params.seed_deposit);

      const balBefore: BigNumber = await this.yakisoba.balanceOf(
        this.deployer.address
      );
      const expectedFees = await this.yakisoba.computeFees();
      const estimatedSharesMinted = await this.yakisoba.convertToShares(
        expectedFees[0].add(expectedFees[1])
      );

      expect(await this.yakisoba.takeFees()).to.not.be.reverted;

      const balAfter: BigNumber = await this.yakisoba.balanceOf(
        this.deployer.address
      );

      expect(await this.yakisoba.balanceOf(this.deployer.address)).to.be.equal(
        balBefore.add(estimatedSharesMinted)
      );
      const { 0: perfFeeComp, 1: mgmtFeeComp } = await this.yakisoba.computeFees();
      expect(perfFeeComp).to.be.equal(0);
      expect(mgmtFeeComp).to.be.equal(0);
      const newCheckpoint = await this.yakisoba.checkpoint();
      expect(newCheckpoint[1]).to.be.equal(await this.yakisoba.sharePrice());
      expect(newCheckpoint[0]).to.be.greaterThan(firstCheckpoint[0]);
    });

    it("Takes management fees", async function () {
      const firstCheckpoint = await this.yakisoba.checkpoint();

      expect(firstCheckpoint[1]).to.be.equal(await this.yakisoba.sharePrice());

      // We reuse the setup from the previous test about management fees
      await this.yakisoba.setFees(0, mgmtFee, 0);
      await this.yakisoba.mint(params.seed_deposit.mul(5), this.alice.address);
      const sharePrice: BigNumber = await this.yakisoba.sharePrice();
      // We disable automine to simulate transactions sent in the same block
      await block.setAutomine(false);
      await this.yakisoba.takeFees();
      await this.usdc.transfer(this.yakisoba.address, params.seed_deposit);
      const fees = await this.yakisoba.computeFees();
      expect(fees[1]).to.be.equal(0);
      await block.setAutomine(true);

      const balBefore: BigNumber = await this.yakisoba.balanceOf(
        this.deployer.address
      );
      // We try to compute fees after 1 year
      await time.increase(86400 * 365);
      const totalAssets: BigNumber = await this.yakisoba.totalAssets();
      const sharePrice2: BigNumber = await this.yakisoba.sharePrice();
      const gain: BigNumber = sharePrice2.sub(sharePrice);
      const fees2 = await this.yakisoba.computeFees();
      expect(fees2[1]).to.be.within(
        totalAssets.mul(mgmtFee).div(10000).sub(10000),
        totalAssets.mul(mgmtFee).div(10000).add(10000) // 10000 is the error margin due to time
      );

      const expectedSharesMinted = await this.yakisoba.convertToShares(fees2[1]);

      await expect(this.yakisoba.takeFees()).to.not.be.reverted;
      const balAfter: BigNumber = await this.yakisoba.balanceOf(
        this.deployer.address
      );

      // We check that the shares minted are correct
      expect(balAfter).to.be.equal(balBefore.add(expectedSharesMinted));
      const newCheckpoint = await this.yakisoba.checkpoint();
      expect(firstCheckpoint[0]).to.be.lessThan(newCheckpoint[0]);
    });

    it("Reverts if the caller is not the owner", async function () {
      await expect(
        this.yakisoba.connect(this.alice).takeFees()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Caps fees if gain is too low", async function () {
      const firstCheckpoint = await this.yakisoba.checkpoint();
      expect(firstCheckpoint[1]).to.be.equal(await this.yakisoba.sharePrice());
      // We reuse the setup from the previous test about management fees
      await this.yakisoba.setFees(perfFee, mgmtFee, 0);
      const sharePrice: BigNumber = await this.yakisoba.sharePrice();
      // We disable automine to simulate transactions sent in the same block
      await block.setAutomine(false);
      await this.yakisoba.takeFees();
      await this.usdc.transfer(
        this.yakisoba.address,
        params.seed_deposit.div(100)
      );
      const fees = await this.yakisoba.computeFees();
      expect(fees[1]).to.be.equal(0);
      await block.setAutomine(true);

      const balBefore: BigNumber = await this.yakisoba.balanceOf(
        this.deployer.address
      );
      // We try to compute fees after 1 year
      await time.increase(86400 * 365);
      const totalAssets: BigNumber = await this.yakisoba.totalAssets();
      const sharePrice2: BigNumber = await this.yakisoba.sharePrice();
      const gain: BigNumber = sharePrice2.sub(sharePrice);
      const fees2 = await this.yakisoba.computeFees();

      // The sum of the fees should be capped at the gain made by the yakisoba
      expect(fees2[1].add(fees2[0])).to.be.equal(params.seed_deposit.div(100));
    });
  });
});
