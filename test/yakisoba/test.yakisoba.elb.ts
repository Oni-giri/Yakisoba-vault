const { expect } = require("chai");
import assert from "assert";

import * as fxt from "../utils/fixtures";

import { BigNumber, Contract, ContractFactory } from "ethers";
import { ethers, upgrades } from "hardhat";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import a from "../utils/mainnet-adresses";
import params from "../utils/params";
import { Yakisoba } from "../../typechain-types/contracts/Yakisoba";
import { ElasticLiquidityPool } from "../../typechain-types/contracts/ElasticLiquidityPool";
import { MockAaveWrongBalanceDepositInterface } from "../../typechain-types/contracts/mocks/MockAaveBalanceDeposit.sol/MockAaveWrongBalanceDeposit";
import { deploy } from "@openzeppelin/hardhat-upgrades/dist/utils";

function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

describe("test.yakisoba.elb", function () {
  this.beforeEach(async function () {
    this.deployer = await fxt.getDeployer();
    this.usdc = await fxt.getUSDCToken(this.deployer);
    await fxt.getUSDC(this.deployer);
    this.decimals = await this.usdc.decimals();
    this.aaveUSDC = await fxt.getAaveUSDC(this.deployer);

    //                  //
    // Yakisoba deployment //
    //                  //
    this.yakisoba = await fxt.deployYakisoba(this.deployer);
    // We unpause to allow withdraws
    await this.yakisoba.unpause();
    expect(await this.yakisoba.paused()).to.equal(false);
    // We increase maxTotalAssets to allow deposits
    await this.yakisoba.setMaxTotalAssets(ethers.constants.MaxUint256);

    // We can deposit more USDC
    await this.yakisoba.deposit(params.seed_deposit.mul(9), this.deployer.address);
    // We can check that the balances are correct before proceeding
    expect(await this.yakisoba.totalSupply()).to.equal(
      params.seed_deposit.mul(10)
    );
    expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
      params.seed_deposit.mul(10)
    );

    this.alice = await fxt.getAlice();

    // We can save the balances after the initial deposit
    this.balanceEOABefore = await this.usdc.balanceOf(this.deployer.address);
    this.balanceYakisobaBefore = await this.usdc.balanceOf(this.yakisoba.address);

    //                 //
    // Swap deployment //
    //                 //
    this.swap = await fxt.deploySwap(this.deployer, this.yakisoba);
  });

  describe("Migrate Liquidity", function () {
    it("Migrates liquidity pool", async function () {
      const balUSDCYakisobaBefore: BigNumber = await this.usdc.balanceOf(
        this.yakisoba.address
      );
      const balUSDCSwapBefore: BigNumber = await this.usdc.balanceOf(
        this.swap.address
      );
      const balAaveUSDCSwapBefore: BigNumber = await this.aaveUSDC.balanceOf(
        this.swap.address
      );
      expect(balAaveUSDCSwapBefore).to.equal(0);

      const balvLPTokenBefore: BigNumber =
        await this.swap.getVirtualLpBalance();

      await this.yakisoba.migrateLiquidityPool(
        this.swap.address,
        params.seed_deposit.mul(10)
      );

      expect(await this.aaveUSDC.balanceOf(this.swap.address)).to.be.at.least(
        params.seed_deposit.mul(10)
      );
      expect(await this.usdc.balanceOf(this.yakisoba.address)).to.be.at.least(
        balUSDCYakisobaBefore.sub(params.seed_deposit.mul(10)).sub(1)
      );

      expect(await this.yakisoba.totalSupply()).to.be.at.least(
        params.seed_deposit.mul(10).sub(1)
      );
      expect(await this.yakisoba.balanceOf(this.deployer.address)).to.be.at.least(
        params.seed_deposit.mul(10).sub(1)
      );
      expect(await this.usdc.balanceOf(this.swap.address)).to.be.at.least(
        balUSDCSwapBefore.sub(1)
      );

      // Check that the liquidity pool struct is correct
      const liquidityPoolStruct: ElasticLiquidityPoolStruct =
        (await this.yakisoba.liquidityPool()) as ElasticLiquidityPoolStruct;
      expect(liquidityPoolStruct.debt).to.be.at.least(
        params.seed_deposit.mul(10).sub(1)
      );
      expect(liquidityPoolStruct.liquidity).to.equal(
        params.seed_deposit.mul(10)
      );
      expect(liquidityPoolStruct.swap).to.equal(this.swap.address);

      // Check the the liquidity pool is enabled
      expect(await this.yakisoba.liquidityPoolEnabled()).to.equal(true);

      // Check that the allowance is correct
      expect(
        await this.usdc.allowance(this.yakisoba.address, this.swap.address)
      ).to.be.greaterThan(0);

      // Check that the virtual LP token balance is correct
      expect(await this.swap.getVirtualLpBalance()).to.be.greaterThan(
        balvLPTokenBefore
      );
    });

    it("Reverts if the liquidity pool migrator is not the owner", async function () {
      await expect(
        this.yakisoba
          .connect(this.alice)
          .migrateLiquidityPool(this.swap.address, params.seed_deposit.mul(10))
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Emits PoolMigrated event when migrating liquidity pool (1)", async function () {
      await expect(
        this.yakisoba.migrateLiquidityPool(
          this.swap.address,
          params.seed_deposit.mul(10)
        )
      )
        .to.emit(this.yakisoba, "PoolMigrated")
        .withArgs(this.swap.address, params.seed_deposit.mul(10));
    });

    it("Emits LiquidityPoolEnabled event when migrating liquidity pool (2)", async function () {
      await expect(
        this.yakisoba.migrateLiquidityPool(
          this.swap.address,
          params.seed_deposit.mul(10)
        )
      )
        .to.emit(this.yakisoba, "LiquidityPoolEnabled")
        .withArgs(true);
    });

    it("Doesn't revert if the old pool fails to migrate", async function () {
      const MockLiquidityPool: ContractFactory =
        await ethers.getContractFactory(
          "MockLiquidityPoolRevertOnMigrate",
          this.deployer
        );

      const mockLiquidityPool: Contract = await MockLiquidityPool.deploy();
      await this.yakisoba.migrateLiquidityPool(
        mockLiquidityPool.address,
        params.seed_deposit.mul(10)
      );

      await mockLiquidityPool.setFailOnMigrate(true);

      sleep(10000);
      await this.yakisoba.migrateLiquidityPool(
        ethers.constants.AddressZero,
        params.seed_deposit.mul(10)
      );
    });

    it("Allows to migrate liquidity pool to zero address", async function () {
      await expect(
        this.yakisoba.migrateLiquidityPool(
          this.swap.address,
          params.seed_deposit.mul(10)
        )
      ).not.to.be.reverted;

      await expect(
        this.yakisoba.migrateLiquidityPool(
          ethers.constants.AddressZero,
          params.seed_deposit.mul(10)
        )
      ).not.to.be.reverted;

      expect(await this.yakisoba.liquidityPoolEnabled()).to.equal(false);

      // LP should be disabled
      const liquidityPoolStruct: ElasticLiquidityPoolStruct =
        (await this.yakisoba.liquidityPool()) as ElasticLiquidityPoolStruct;
      expect(liquidityPoolStruct.debt).to.equal(0);
      expect(liquidityPoolStruct.liquidity).to.equal(0);
      expect(liquidityPoolStruct.swap).to.equal(ethers.constants.AddressZero);
      expect(
        await this.usdc.allowance(this.yakisoba.address, this.swap.address)
      ).to.equal(0);
    });

    it("Reverts if someone other enables liquidity pool", async function () {
      await expect(
        this.yakisoba.connect(this.alice).enableLiquidityPool(true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Reverts if liquidity pool is not set", async function () {
      const liquidityPool = await this.yakisoba.liquidityPool();
      expect(liquidityPool.swap).to.equal(ethers.constants.AddressZero);
      await expect(
        this.yakisoba.enableLiquidityPool(true)
      ).to.be.revertedWithCustomError(this.yakisoba, "LiquidityPoolNotSet");
    });

    it("Doesnt add liquidity if 0 amount is selected", async function () {
      await expect(this.yakisoba.migrateLiquidityPool(this.swap.address, 0)).not.to
        .be.reverted;

      expect(await this.yakisoba.liquidityPoolEnabled()).to.equal(false);
      const liquidityPoolStruct: ElasticLiquidityPoolStruct =
        (await this.yakisoba.liquidityPool()) as ElasticLiquidityPoolStruct;
      expect(liquidityPoolStruct.debt).to.equal(0);
      expect(liquidityPoolStruct.liquidity).to.equal(0);
      expect(liquidityPoolStruct.swap).to.equal(this.swap.address);
      expect(await this.swap.getVirtualLpBalance()).to.equal(0);
    });
  });

  describe("Increase/Decrease Liquidity", function () {
    beforeEach(async function () {
      // We migrate the liquidity pool
      expect(
        await this.yakisoba.migrateLiquidityPool(this.swap.address, 0)
      ).not.to.be.reverted;

      this.balUSDCYakisobaBefore = await this.usdc.balanceOf(this.yakisoba.address);
    });

    it("Increases liquidity", async function () {
      const liquidityStruct: ElasticLiquidityPoolStruct =
        (await this.yakisoba.liquidityPool()) as ElasticLiquidityPoolStruct;

      const balUSDCYakisobaBefore: BigNumber = await this.usdc.balanceOf(
        this.yakisoba.address
      );

      const balUSDCSwapBefore: BigNumber = await this.usdc.balanceOf(
        this.swap.address
      );
      const balAaveUSDCSwapBefore: BigNumber = await this.aaveUSDC.balanceOf(
        this.swap.address
      );

      const balvLPTokenBefore: BigNumber =
        await this.swap.getVirtualLpBalance();

      // We increase the liquidity
      await this.yakisoba.increaseLiquidity(this.balUSDCYakisobaBefore);

      expect(await this.aaveUSDC.balanceOf(this.swap.address)).to.be.within(
        balAaveUSDCSwapBefore.add(this.balUSDCYakisobaBefore).sub(1),
        balAaveUSDCSwapBefore.add(this.balUSDCYakisobaBefore).add(1)
      );
      expect(await this.usdc.balanceOf(this.yakisoba.address)).to.be.at.least(
        balUSDCYakisobaBefore.sub(this.balUSDCYakisobaBefore).sub(1)
      );
      expect(await this.swap.getVirtualLpBalance()).to.be.greaterThan(
        balvLPTokenBefore
      );
      const newLiquidityStruct: ElasticLiquidityPoolStruct =
        (await this.yakisoba.liquidityPool()) as ElasticLiquidityPoolStruct;
      expect(newLiquidityStruct.debt).to.be.at.least(
        liquidityStruct.debt.add(this.balUSDCYakisobaBefore).sub(1)
      );
      expect(newLiquidityStruct.liquidity).to.equal(
        liquidityStruct.liquidity.add(this.balUSDCYakisobaBefore)
      );
      expect(newLiquidityStruct.swap).to.equal(this.swap.address);
    });

    it("Reverts if the liquidity caller is not the owner", async function () {
      await expect(
        this.yakisoba
          .connect(this.alice)
          .increaseLiquidity(this.balUSDCYakisobaBefore)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Emits an AddLiquidity event when increasing liquidity", async function () {
      await expect(
        this.yakisoba.increaseLiquidity(this.balUSDCYakisobaBefore)
      ).to.emit(this.yakisoba, "LiquidityChanged");
    });

    it("Decreases liquidity", async function () {
      // We increase the liquidity

      await expect(this.yakisoba.increaseLiquidity(this.balUSDCYakisobaBefore)).not.to
        .be.reverted;

      const vLPBalBefore: BigNumber = await this.swap.getVirtualLpBalance();
      const balAaveUSDCSwapBefore: BigNumber = await this.aaveUSDC.balanceOf(
        this.swap.address
      );

      const liquidityStruct: ElasticLiquidityPoolStruct =
        (await this.yakisoba.liquidityPool()) as ElasticLiquidityPoolStruct;

      expect(liquidityStruct.debt).to.be.at.least(
        this.balUSDCYakisobaBefore.sub(1)
      );
      expect(liquidityStruct.liquidity).to.equal(this.balUSDCYakisobaBefore);
      // We decrease the liquidity

      await expect(this.yakisoba.decreaseLiquidity(this.balUSDCYakisobaBefore.div(2)))
        .not.to.be.reverted;

      const newLiquidityStruct: ElasticLiquidityPoolStruct =
        (await this.yakisoba.liquidityPool()) as ElasticLiquidityPoolStruct;
      expect(newLiquidityStruct.debt).to.be.at.least(
        liquidityStruct.debt.sub(this.balUSDCYakisobaBefore.div(2)).sub(1)
      );
      expect(newLiquidityStruct.liquidity).to.equal(
        liquidityStruct.liquidity.sub(this.balUSDCYakisobaBefore.div(2))
      );
      expect(newLiquidityStruct.swap).to.equal(this.swap.address);

      expect(await this.usdc.balanceOf(this.yakisoba.address)).to.be.at.least(
        this.balUSDCYakisobaBefore.div(2).sub(1)
      );

      expect(await this.swap.getVirtualLpBalance()).to.be.at.least(
        vLPBalBefore.div(2).sub(1)
      );

      expect(await this.aaveUSDC.balanceOf(this.swap.address)).to.be.at.least(
        balAaveUSDCSwapBefore.sub(this.balUSDCYakisobaBefore.div(2)).sub(1)
      );
    });

    it("Emits an event when decreasing liquidity", async function () {
      // We increase the liquidity
      await expect(this.yakisoba.increaseLiquidity(this.balUSDCYakisobaBefore)).not.to
        .be.reverted;

      await expect(
        this.yakisoba.decreaseLiquidity(this.balUSDCYakisobaBefore.div(2))
      ).to.emit(this.yakisoba, "LiquidityChanged");
    });

    it("Reverts if the liquidity remover is not the owner", async function () {
      await expect(
        this.yakisoba
          .connect(this.alice)
          .decreaseLiquidity(this.balUSDCYakisobaBefore)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Reverts if trying to decrease liquidity more than the current liquidity", async function () {
      // We increase the liquidity
      await expect(this.yakisoba.increaseLiquidity(this.balUSDCYakisobaBefore)).not.to
        .be.reverted;

      await expect(this.yakisoba.decreaseLiquidity(this.balUSDCYakisobaBefore.add(1)))
        .to.be.reverted;
    });

    it("Allows to remove all of the liquidity", async function () {
      // We increase the liquidity
      await expect(this.yakisoba.increaseLiquidity(this.balUSDCYakisobaBefore)).not.to
        .be.reverted;

      await expect(this.yakisoba.decreaseLiquidity(this.balUSDCYakisobaBefore)).not.to
        .be.reverted;
    });
  });

  describe("Swap in and out", function () {
    beforeEach(async function () {
      await this.yakisoba.setFees(0, 0, 0);
      this.balUSDCYakisobaBefore = await this.usdc.balanceOf(this.yakisoba.address);
      expect(this.balUSDCYakisobaBefore).to.be.greaterThan(0);

      // We set up the liq pool
      await expect(
        this.yakisoba.migrateLiquidityPool(
          this.swap.address,
          this.balUSDCYakisobaBefore
        )
      ).not.to.be.reverted;
      expect(await this.yakisoba.liquidityPoolEnabled()).to.be.equal(true);

      // We check that the liq pool has aaveUSDC
      expect(await this.aaveUSDC.balanceOf(this.swap.address)).to.be.at.least(
        this.balUSDCYakisobaBefore.sub(1)
      );
    });
    it("Deposit with ELB Full", async function () {
      const initialYakisobaBal: BigNumber = await this.yakisoba.balanceOf(
        this.deployer.address
      );
      const initialSwapBal: BigNumber = await this.aaveUSDC.balanceOf(
        this.swap.address
      );
      const initialvLPBal: BigNumber = await this.swap.getVirtualLpBalance();
      await expect(
        this.yakisoba.deposit(params.seed_deposit, this.deployer.address)
      ).not.to.be.reverted;

      // We should have all USDC in the yakisoba
      expect(await this.yakisoba.balanceOf(this.deployer.address)).to.be.at.least(
        initialYakisobaBal.add(params.seed_deposit - 1)
      );
      expect(await this.aaveUSDC.balanceOf(this.swap.address)).to.be.at.least(
        initialSwapBal
      );
      expect(await this.swap.getVirtualLpBalance()).to.equal(initialvLPBal);
      expect(await this.usdc.balanceOf(this.yakisoba.address)).to.be.at.least(
        params.seed_deposit.sub(1)
      );
    });

    it("Withdraw half of ELB", async function () {
      const initialYakisobaBal: BigNumber = await this.yakisoba.balanceOf(
        this.deployer.address
      );
      const initialUSDCBalDeployer: BigNumber = await this.usdc.balanceOf(
        this.deployer.address
      );
      const initialSwapBal: BigNumber = await this.aaveUSDC.balanceOf(
        this.swap.address
      );
      const initialvLPBal: BigNumber = await this.swap.getVirtualLpBalance();
      expect(await this.yakisoba.sharePrice()).to.be.at.least(
        ethers.utils.parseUnits("1", 6).sub(1)
      );

      // We withdraw half of the yakisoba
      await expect(
        this.yakisoba.withdraw(
          initialYakisobaBal.div(2),
          this.deployer.address,
          this.deployer.address
        )
      ).not.to.be.reverted;

      expect(await this.yakisoba.balanceOf(this.deployer.address)).to.be.at.least(
        initialYakisobaBal.div(2).sub(1)
      );

      expect(await this.usdc.balanceOf(this.deployer.address)).to.be.lessThan(
        initialUSDCBalDeployer.add(initialYakisobaBal.div(2))
      );
    });

    it("Withdraw all of ELB", async function () {
      const initialYakisobaBal: BigNumber = await this.yakisoba.balanceOf(
        this.deployer.address
      );

      expect(initialYakisobaBal).to.be.greaterThan(0);
      const initialUSDCBalDeployer: BigNumber = await this.usdc.balanceOf(
        this.deployer.address
      );
      const initialSwapBal: BigNumber = await this.aaveUSDC.balanceOf(
        this.swap.address
      );
      const initialvLPBal: BigNumber = await this.swap.getVirtualLpBalance();
      expect(await this.yakisoba.sharePrice()).to.be.equal(
        ethers.utils.parseUnits("1", 6)
      );

      // We withdraw half of the yakisoba
      await expect(
        this.yakisoba.withdraw(
          initialYakisobaBal,
          this.deployer.address,
          this.deployer.address
        )
      ).not.to.be.reverted;

      expect(await this.yakisoba.balanceOf(this.deployer.address)).to.be.equal(0);

      expect(await this.usdc.balanceOf(this.deployer.address)).to.be.lessThan(
        initialUSDCBalDeployer.add(initialYakisobaBal)
      );
    });

    it("Withdraws more than the ELB debt", async function () {
      await this.yakisoba.deposit(params.seed_deposit, this.deployer.address);

      // ELB is full
      expect(await this.usdc.balanceOf(this.yakisoba.address)).to.be.at.least(
        params.seed_deposit.sub(1)
      );

      // We withdraw more than the ELB debt
      const pool: ElasticLiquidityPoolStruct =
        (await this.yakisoba.liquidityPool()) as ElasticLiquidityPoolStruct;

      await expect(
        this.yakisoba.withdraw(
          await this.yakisoba.balanceOf(this.deployer.address),
          this.deployer.address,
          this.deployer.address
        )
      ).not.to.be.reverted;
    });

    it("Allows to withdraw even if the ELB is ded", async function () {
      const aaveMock = await fxt.deployMockAave(
        this.deployer,
        "MockAaveNoWithdraw",
        this.usdc.address
      );

      this.swap = await fxt.deploySwapWithAaveMock(
        this.deployer,
        this.yakisoba,
        aaveMock
      );

      // Withdrawing reverts
      expect(
        aaveMock.withdraw(
          this.deployer.address,
          this.deployer.address,
          params.seed_deposit
        )
      ).to.be.reverted;

      await this.yakisoba.deposit(params.seed_deposit, this.deployer.address);

      await this.yakisoba.migrateLiquidityPool(
        this.swap.address,
        await this.usdc.balanceOf(this.yakisoba.address)
      );

      expect(await this.yakisoba.liquidityPoolEnabled()).to.be.equal(true);
      const balBefore: BigNumber = await this.usdc.balanceOf(
        this.deployer.address
      );
      await this.yakisoba.deposit(params.seed_deposit, this.deployer.address);

      // We can withdraw and because we have enough assets in the yakisoba, we can withdraw
      await expect(
        this.yakisoba.withdraw(
          params.seed_deposit,
          this.deployer.address,
          this.deployer.address
        )
      ).not.to.be.reverted;
      expect(await this.usdc.balanceOf(this.deployer.address)).to.be.at.least(
        balBefore.sub(1)
      );
    });
  });

  describe("Rebalance Liquidity Pool", function () {
    beforeEach(async function () {
      await this.yakisoba.setFees(0, 0, 0);
      this.balUSDCYakisobaBefore = await this.usdc.balanceOf(this.yakisoba.address);
      expect(this.balUSDCYakisobaBefore).to.be.greaterThan(0);

      // We set up the liq pool
      await expect(
        this.yakisoba.migrateLiquidityPool(
          this.swap.address,
          this.balUSDCYakisobaBefore
        )
      ).not.to.be.reverted;
      expect(await this.yakisoba.liquidityPoolEnabled()).to.be.equal(true);

      // We check that the liq pool has aaveUSDC
      expect(await this.aaveUSDC.balanceOf(this.swap.address)).to.be.at.least(
        this.balUSDCYakisobaBefore.sub(1)
      );
    });

    it("Rebalance Liquidity Pool", async function () {
      // We withdraw half of the pool
      await this.yakisoba.withdraw(
        (await this.yakisoba.balanceOf(this.deployer.address)).div(2),
        this.deployer.address,
        this.deployer.address
      );

      // We check that the liq pool is unbalanced
      expect(await this.swap.getTokenBalance(1)).to.be.lessThan(
        await this.swap.getTokenBalance(0)
      );

      const balUSDCYakisoba: BigNumber = await this.usdc.balanceOf(
        this.yakisoba.address
      );
      const sharePrice: BigNumber = await this.yakisoba.sharePrice();
      await this.usdc.transfer(this.yakisoba.address, params.seed_deposit.mul(10));

      // We have USDC available in the yakisoba
      expect(await this.usdc.balanceOf(this.yakisoba.address)).to.be.greaterThan(
        balUSDCYakisoba
      );

      // we rebalance the liq pool
      await expect(this.yakisoba.rebalanceLiquidityPool()).not.to.be.reverted;

      // Share price has increased
      expect(await this.yakisoba.sharePrice()).to.be.greaterThan(sharePrice);

      // We check that the liq pool is balanced
      // The rounding traps a wei
      expect(await this.swap.getTokenBalance(1)).to.be.within(
        (await this.swap.getTokenBalance(0)).sub(1),
        (await this.swap.getTokenBalance(0)).add(1)
      );
    });

    it("Reverts if the yakisoba is paused", async function () {
      await this.yakisoba.pause();

      await expect(this.yakisoba.rebalanceLiquidityPool()).to.be.revertedWith(
        "Pausable: paused"
      );
    });

    it("Reverts if the liquidity pool is not set", async function () {
      await this.yakisoba.enableLiquidityPool(false);
      await expect(
        this.yakisoba.rebalanceLiquidityPool()
      ).to.be.revertedWithCustomError(this.yakisoba, "LiquidityPoolNotSet");
    });

    it("Reverts if there are no funds to rebalance", async function () {
      await this.yakisoba.withdraw(
        await this.yakisoba.balanceOf(this.deployer.address),
        this.deployer.address,
        this.deployer.address
      );

      await expect(
        this.yakisoba.rebalanceLiquidityPool()
      ).to.be.revertedWithCustomError(this.yakisoba, "NoFundsToRebalance");
    });

    it("Emits the RebalanceLiquidityPool event", async function () {
      await this.yakisoba.withdraw(
        (await this.yakisoba.balanceOf(this.deployer.address)).div(2),
        this.deployer.address,
        this.deployer.address
      );

      const balUSDCYakisoba: BigNumber = await this.usdc.balanceOf(
        this.yakisoba.address
      );
      const sharePrice: BigNumber = await this.yakisoba.sharePrice();
      this.usdc.transfer(this.yakisoba.address, params.seed_deposit.mul(10));

      await expect(this.yakisoba.rebalanceLiquidityPool()).to.emit(
        this.yakisoba,
        "LiquidityRebalanced"
      );
    });

    it("Emits a share price Updated event", async function () {
      await this.yakisoba.withdraw(
        (await this.yakisoba.balanceOf(this.deployer.address)).div(2),
        this.deployer.address,
        this.deployer.address
      );

      const balUSDCYakisoba: BigNumber = await this.usdc.balanceOf(
        this.yakisoba.address
      );
      const sharePrice: BigNumber = await this.yakisoba.sharePrice();
      this.usdc.transfer(this.yakisoba.address, params.seed_deposit.mul(10));

      await expect(this.yakisoba.rebalanceLiquidityPool()).to.emit(
        this.yakisoba,
        "SharePriceUpdated"
      );
    });
  });

  describe("Deposit with liquidity pool", function () {
    beforeEach(async function () {
      // We migrate the liquidity pool
      expect(
        await this.yakisoba.migrateLiquidityPool(
          this.swap.address,
          params.seed_deposit
        )
      ).not.to.be.reverted;

      this.balUSDCYakisobaBefore = await this.usdc.balanceOf(this.yakisoba.address);
      this.yakisoba.setFees(0, 0, 0);
      expect(await this.yakisoba.liquidityPoolEnabled()).to.be.equal(true);
      expect((await this.yakisoba.liquidityPool())[1]).to.be.at.least(
        params.seed_deposit.sub(1)
      );
    });
    it("Deposit with liquidity pool depleted", async function () {
      // We withdraw the seed deposit
      await expect(
        this.yakisoba.withdraw(
          await this.yakisoba.balanceOf(this.deployer.address),
          this.deployer.address,
          this.deployer.address
        )
      ).not.to.be.reverted;
      const yakisobaBalBefore: BigNumber = await this.yakisoba.balanceOf(
        this.deployer.address
      );

      expect(await this.yakisoba.balanceOf(this.deployer.address)).to.be.equal(0);
      expect(await this.usdc.balanceOf(this.yakisoba.address)).to.be.equal(0);

      // We just withdrew everything, so debt should be 0
      expect((await this.yakisoba.liquidityPool())[0]).to.be.equal(0);

      const liquidityPoolDebtBefore = (await this.yakisoba.liquidityPool())[0];

      // Now that we're sure that the pool is depleted, we deposit
      await expect(
        this.yakisoba.deposit(params.seed_deposit.div(10), this.deployer.address)
      ).not.to.be.reverted;

      expect(
        await this.yakisoba.balanceOf(this.deployer.address)
      ).to.be.greaterThan(yakisobaBalBefore.add(params.seed_deposit.div(10)));

      // Everything should have gone to the liquidity pool
      expect(await this.usdc.balanceOf(this.yakisoba.address)).to.be.equal(
        ethers.constants.Zero
      );
      expect((await this.yakisoba.liquidityPool())[0]).to.be.greaterThan(
        liquidityPoolDebtBefore.add(params.seed_deposit.div(10))
      );

      // We deposit again
      // The overflow should go in the yakisoba
      await expect(
        this.yakisoba.deposit(params.seed_deposit.mul(10), this.deployer.address)
      ).not.to.be.reverted;

      expect(await this.usdc.balanceOf(this.yakisoba.address)).to.be.greaterThan(
        ethers.constants.Zero
      );

      // Liquidity pool should be full (minus 1 because of flooring)
      expect((await this.yakisoba.liquidityPool())[0]).to.be.at.least(
        params.seed_deposit.sub(1)
      );
    });

    it("Should deposit only what is needed in the elb", async function () {
      const tokenBalSwap: BigNumber = await this.swap.getTokenBalance(1);
      expect(await tokenBalSwap).to.be.at.least(params.seed_deposit.sub(1));

      // We withdraw the full amount, so yakisoba is depleted (but not empty, as some is left in the ELB)
      await expect(
        this.yakisoba.withdraw(
          this.yakisoba.balanceOf(this.deployer.address),
          this.deployer.address,
          this.deployer.address
        )
      ).not.to.be.reverted;
      const yakisobaBalBefore: BigNumber = await this.yakisoba.balanceOf(
        this.deployer.address
      );
      const balUSDCYakisobaBefore: BigNumber = await this.usdc.balanceOf(
        this.yakisoba.address
      );

      expect(await this.swap.getTokenBalance(1)).to.be.lessThan(tokenBalSwap);
      await expect(
        this.yakisoba.deposit(params.seed_deposit.mul(2), this.deployer.address)
      ).not.to.be.reverted;
      expect(await this.usdc.balanceOf(this.yakisoba.address)).to.be.greaterThan(
        balUSDCYakisobaBefore
      );
      expect(await this.swap.getTokenBalance(1)).to.be.at.least(
        params.seed_deposit.sub(1)
      );

      // Pool is full
      expect((await this.yakisoba.liquidityPool())[0]).to.be.at.least(
        params.seed_deposit.sub(1)
      );
    });
    it("Reverts if amount is 0", async function () {
      // We deploy the swap
      await expect(
        this.yakisoba.mint(0, this.deployer.address)
      ).to.be.revertedWithCustomError(this.yakisoba, "AmountZero");
    });

    it("Reverts if we didn't mint any shares", async function () {
      const yakisoba: Contract = await fxt.deployYakisoba(this.deployer);
      const virtual_token = "0x0000000000000000000000000000000000000000";
      const aave_usdc_decimals: number = await (
        await ethers.getContractAt("IERC20Metadata", a.aave_usdc)
      ).decimals();

      const decimals: number[] = [aave_usdc_decimals, aave_usdc_decimals];
      const aave_tokens: String[] = [virtual_token, a.aave_usdc];
      const real_tokens: String[] = [virtual_token, a.usdc];
      const swapUtils = await (
        await ethers.getContractFactory("SwapUtils", this.deployer)
      ).deploy();

      const amplificationUtils = await (
        await ethers.getContractFactory("AmplificationUtils", this.deployer)
      ).deploy();

      const Swap = await ethers.getContractFactory("MockSwapReturnsNothing", {
        signer: this.deployer,
        libraries: {
          AmplificationUtils: amplificationUtils.address,
          SwapUtils: swapUtils.address,
        },
      });
      const swap: Contract = (await Swap.deploy(
        aave_tokens,
        real_tokens,
        decimals,
        params.initial_a,
        a.aave_lending_pool,
        yakisoba.address
      )) as Contract;
      await swap.deployed();

      await yakisoba.unpause();
      expect(await yakisoba.paused()).to.equal(false);
      // We increase maxTotalAssets to allow deposits
      await yakisoba.setMaxTotalAssets(ethers.constants.MaxUint256);

      // We can deposit USDC
      await yakisoba.deposit(params.seed_deposit.mul(9), this.deployer.address);

      // We set the swap
      await yakisoba.migrateLiquidityPool(swap.address, params.seed_deposit);

      const enabled = await yakisoba.liquidityPoolEnabled();
      expect(enabled).to.equal(true);

      yakisoba.redeem(
        await yakisoba.balanceOf(this.deployer.address),
        this.deployer.address,
        this.deployer.address
      );

      expect(await yakisoba.totalSupply()).to.equal(0);

      this.usdc.transfer(yakisoba.address, params.seed_deposit);
      // We should revert
      await expect(
        yakisoba.deposit(1, this.deployer.address)
      ).to.be.revertedWithCustomError(this.yakisoba, "IncorrectShareAmount");
    });
  });
});
