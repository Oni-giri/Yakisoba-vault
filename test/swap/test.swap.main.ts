const { expect } = require("chai");

import * as fxt from "../utils/fixtures";

import { BigNumber, Contract } from "ethers";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Swap } from "../../typechain-types/contracts/Swap";

import a from "../utils/mainnet-adresses";
import assert from "assert";
import params from "../utils/params";
import { ERC20 } from "../../typechain-types/@openzeppelin/contracts/token/ERC20/ERC20";
import { ERC20Metadata } from "../../typechain-types/@openzeppelin/contracts/token/ERC20/extensions/ERC20Metadata";
import { ContractFactory } from "ethers";
import { ILendingPool } from "../../typechain-types/contracts/interfaces/ILendingPool";
import adresses from "../utils/mainnet-adresses";
import { MockAaveFailMigration } from "../../typechain-types/contracts/mocks/MockAaveFailMigration";
import { MockERC20 } from "../../typechain-types/contracts/mocks/MockERC20";
import { mockAaveBalanceDepositSol } from "../../typechain-types/contracts/mocks";
import { SwapUtils } from "../../typechain-types/contracts/utils/SwapUtils";
require("@nomicfoundation/hardhat-chai-matchers");

describe("test.swap.main", function () {
  beforeEach(async function () {
    this.deployer = await fxt.getDeployer();
    this.alice = await fxt.getAlice();
    this.yakisoba = await fxt.deployYakisoba(this.deployer);
    // this.swap = await fxt.deploySwap(this.deployer, this.yakisoba);
    this.usdc = await fxt.getUSDCToken(this.deployer);
    this.virtual_token = ethers.constants.AddressZero;
    this.aave_usdc_decimals = await (
      await ethers.getContractAt("IERC20Metadata", a.aave_usdc)
    ).decimals();

    this.swapUtils = await (
      await ethers.getContractFactory("SwapUtils", this.deployer)
    ).deploy();

    this.amplificationUtils = await (
      await ethers.getContractFactory("AmplificationUtils", this.deployer)
    ).deploy();
    this.Swap = await ethers.getContractFactory("Swap", {
      signer: this.deployer,
      libraries: {
        AmplificationUtils: this.amplificationUtils.address,
        SwapUtils: this.swapUtils.address,
      },
    });

    await fxt.getUSDC(this.deployer);
    await fxt.getUSDC(this.alice);
    this.swap = await fxt.deploySwap(this.deployer, this.deployer);
    const usdc: ERC20Metadata = await fxt.getUSDCToken(this.deployer);
    await usdc.approve(this.swap.address, ethers.constants.MaxUint256);
    await usdc
      .connect(this.alice)
      .approve(this.swap.address, ethers.constants.MaxUint256);

    this.aave_usdc = (await ethers.getContractAt(
      "ERC20",
      a.aave_usdc
    )) as ERC20;
  });

  describe("Initialization", function () {
    describe("Swap", function () {
      it("Owner is set correctly", async function () {
        expect(await this.swap.owner()).to.equal(this.deployer.address);
      });

      it("Yakisoba is set correctly", async function () {
        expect(await this.swap.CRATE()).to.equal(this.deployer.address);
      });

      it("Lending pool is set correctly", async function () {
        expect(await this.swap.LENDING_POOL()).to.equal(a.aave_lending_pool);
      });

      it("Pooled token set correctly", async function () {
        expect(
          await this.swap.getPooledToken(params.real_asset_index)
        ).to.equal(a.aave_usdc);
        expect(
          await this.swap.getPooledToken(params.virtual_asset_index)
        ).to.equal(ethers.constants.AddressZero);
      });

      it("Underlying tokens are set correctly", async function () {
        expect(
          await this.swap.UNDERLYING_TOKENS(ethers.constants.Zero)
        ).to.equal(ethers.constants.AddressZero);
        expect(await this.swap.UNDERLYING_TOKENS(1)).to.equal(a.usdc);
      });

      it("allowance is set correctly", async function () {
        const usdc: Contract = await fxt.getUSDCToken(this.deployer);
        expect(
          await usdc.allowance(this.swap.address, a.aave_lending_pool)
        ).to.equal(ethers.constants.MaxUint256);
      });

      it("swapStorage is set correctly", async function () {
        let swapStorage: {
          initialA: BigNumber;
          futureA: BigNumber;
          initialATime: BigNumber;
          futureATime: BigNumber;
          swapFee: BigNumber;
          adminFee: BigNumber;
        };
        swapStorage = await this.swap.swapStorage();
        expect(swapStorage.initialA).to.equal(
          params.initial_a * params.a_precision
        );
        expect(swapStorage.futureA).to.equal(
          params.initial_a * params.a_precision
        );
        expect(swapStorage.initialATime).to.equal(0);
        expect(swapStorage.futureATime).to.equal(0);
      });

      describe("Reverts", function () {
        it("Revert if array length is wrong", async function () {
          // _pooledToken check
          await expect(
            this.Swap.deploy(
              [this.virtual_token, a.aave_usdc, this.virtual_token],
              [this.virtual_token, a.usdc],
              [this.aave_usdc_decimals, this.aave_usdc_decimals],
              params.initial_a,
              a.aave_lending_pool,
              this.yakisoba.address
            )
          ).to.be.revertedWithCustomError(this.Swap, `WrongLength`);

          await expect(
            this.Swap.deploy(
              [this.virtual_token],
              [this.virtual_token, a.usdc],
              [this.aave_usdc_decimals, this.aave_usdc_decimals],
              params.initial_a,
              a.aave_lending_pool,
              this.yakisoba.address
            )
          ).to.be.revertedWithCustomError(this.Swap, `WrongLength`);

          // _underlyingToken check
          await expect(
            this.Swap.deploy(
              [this.virtual_token, a.aave_usdc],
              [this.virtual_token, a.usdc, a.usdc],
              [this.aave_usdc_decimals, this.aave_usdc_decimals],
              params.initial_a,
              a.aave_lending_pool,
              this.yakisoba.address
            )
          ).to.be.revertedWithCustomError(this.Swap, `WrongLength`);

          await expect(
            this.Swap.deploy(
              [this.virtual_token, a.aave_usdc],
              [this.virtual_token],
              [this.aave_usdc_decimals, this.aave_usdc_decimals],
              params.initial_a,
              a.aave_lending_pool,
              this.yakisoba.address
            )
          ).to.be.revertedWithCustomError(this.Swap, `WrongLength`);

          // _decimals check
          await expect(
            this.Swap.deploy(
              [this.virtual_token, a.aave_usdc],
              [this.virtual_token, a.usdc],
              [
                this.aave_usdc_decimals,
                this.aave_usdc_decimals,
                this.aave_usdc_decimals,
              ],
              params.initial_a,
              a.aave_lending_pool,
              this.yakisoba.address
            )
          ).to.be.revertedWithCustomError(this.Swap, `WrongLength`);

          await expect(
            this.Swap.deploy(
              [this.virtual_token, a.aave_usdc],
              [this.virtual_token, a.usdc],
              [this.aave_usdc_decimals],
              params.initial_a,
              a.aave_lending_pool,
              this.yakisoba.address
            )
          ).to.be.revertedWithCustomError(this.Swap, `WrongLength`);
        });

        it("Reverts if decimals are too high", async function () {
          await expect(
            this.Swap.deploy(
              [this.virtual_token, a.aave_usdc],
              [this.virtual_token, a.usdc],
              [this.aave_usdc_decimals, 19], // 19 is too high
              params.initial_a,
              a.aave_lending_pool,
              this.yakisoba.address
            )
          )
            .to.be.revertedWithCustomError(this.Swap, `WrongDecimals`)
            .withArgs(19, 1);

          // This should pass
          this.Swap.deploy(
            [this.virtual_token, a.aave_usdc],
            [this.virtual_token, a.usdc],
            [this.aave_usdc_decimals, this.usdc_decimals],
            params.initial_a,
            a.aave_lending_pool,
            this.yakisoba.address
          );
        });

        it("Reverts if real asset token is 0", async function () {
          // Case 1: _pooledToken[1] is 0
          await expect(
            this.Swap.deploy(
              [this.virtual_token, this.virtual_token],
              [a.usdc, this.virtual_token],
              [this.aave_usdc_decimals, this.aave_usdc_decimals],
              params.initial_a,
              a.aave_lending_pool,
              this.yakisoba.address
            )
          ).to.be.revertedWithCustomError(this.Swap, `WrongToken`);

          // Case 2: _underlyingToken[1] is == 0
          await expect(
            this.Swap.deploy(
              [this.virtual_token, a.aave_usdc],
              [this.virtual_token, this.virtual_token],
              [this.aave_usdc_decimals, this.aave_usdc_decimals],
              params.initial_a,
              a.aave_lending_pool,
              this.yakisoba.address
            )
          ).to.be.revertedWithCustomError(this.Swap, `WrongToken`);

          // Case 3 _underlyingToken[0] is != 0
          await expect(
            this.Swap.deploy(
              [this.virtual_token, a.aave_usdc],
              [a.usdc, a.usdc],
              [this.aave_usdc_decimals, this.aave_usdc_decimals],
              params.initial_a,
              a.aave_lending_pool,
              this.yakisoba.address
            )
          ).to.be.revertedWithCustomError(this.Swap, `WrongToken`);

          // Case 4 _pooledToken[0] is != 0
          await expect(
            this.Swap.deploy(
              [a.aave_usdc, a.aave_usdc],
              [a.usdc, a.usdc],
              [this.aave_usdc_decimals, this.aave_usdc_decimals],
              params.initial_a,
              a.aave_lending_pool,
              this.yakisoba.address
            )
          ).to.be.revertedWithCustomError(this.Swap, `WrongToken`);
        });

        it("Reverts if a is too high", async function () {
          await expect(
            this.Swap.deploy(
              [this.virtual_token, a.aave_usdc],
              [this.virtual_token, a.usdc],
              [this.aave_usdc_decimals, this.aave_usdc_decimals],
              params.max_a + 1, // +1
              a.aave_lending_pool,
              this.yakisoba.address
            )
          ).to.be.revertedWithCustomError(this.Swap, `WrongAFactor`);

          // This should pass
          await this.Swap.deploy(
            [this.virtual_token, a.aave_usdc],
            [this.virtual_token, a.usdc],
            [this.aave_usdc_decimals, this.aave_usdc_decimals],
            params.max_a,
            a.aave_lending_pool,
            this.yakisoba.address
          );
        });
      });
    });
  });

  describe("Liquidity", function () {
    describe("addLiquidity", function () {
      it("Reverts if the user tries to add liquidity with 0 amount", async function () {
        await expect(
          this.swap.addLiquidity(0, ethers.constants.MaxUint256)
        ).to.be.revertedWithCustomError(this.swap, `ZeroAmount`);
      });

      it("Revert if the user doesn't have enough tokens", async function () {
        const balance = await this.usdc.balanceOf(this.deployer.address);
        await expect(
          this.swap.addLiquidity(balance.add(1), ethers.constants.MaxUint256)
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

        // This should pass
        await expect(
          this.swap.addLiquidity(balance, ethers.constants.MaxUint256)
        ).not.to.be.reverted;
      });

      it("Reverts if we didn't get enough tokens from aave", async function () {
        const mock: Contract = await fxt.deployMockAave(
          this.deployer,
          "MockAaveWrongBalanceDeposit",
          this.usdc.address
        );
        const swap: Swap = (await fxt.deploySwapWithAaveMock(
          this.deployer,
          this.deployer,
          mock
        )) as Swap;

        await expect(
          swap.addLiquidity(params.seed_deposit, ethers.constants.MaxUint256)
        )
          .to.be.revertedWithCustomError(swap, `WrongBalance`)
          .withArgs(ethers.constants.Zero, params.seed_deposit);
      });

      it("Doesn't revert if we got enough tokens from aave", async function () {
        await expect(
          this.swap.addLiquidity(
            params.seed_deposit,
            ethers.constants.MaxUint256
          )
        ).not.to.be.reverted;
      });

      it("Reverts if the depositor is not the yakisoba", async function () {
        await expect(
          this.swap
            .connect(this.alice)
            .addLiquidity(params.seed_deposit, ethers.constants.MaxUint256)
        ).to.be.revertedWithCustomError(this.swap, `OnlyYakisoba`);
      });

      it("Doesn't revert if the depositor is the yakisoba", async function () {
        await expect(
          this.swap.addLiquidity(
            params.seed_deposit,
            ethers.constants.MaxUint256
          )
        ).not.to.be.reverted;
      });

      it("Reverts if the timestamp is too low", async function () {
        await expect(
          this.swap.addLiquidity(params.seed_deposit, 0)
        ).to.be.revertedWithCustomError(this.swap, `DeadlineCheck`);
      });

      it("Doesn't revert if the timestamp is high enough", async function () {
        await expect(
          this.swap.addLiquidity(
            params.seed_deposit,
            (await ethers.provider.getBlock("latest")).timestamp + 1000
          )
        ).not.to.be.reverted;
      });

      it("Receives aave tokens", async function () {
        const aaveToken: ERC20 = (await ethers.getContractAt(
          "ERC20",
          a.aave_usdc
        )) as ERC20;

        const balBefore: BigNumber = await aaveToken.balanceOf(
          this.swap.address
        );

        await expect(
          this.swap.addLiquidity(
            params.seed_deposit,
            ethers.constants.MaxUint256
          )
        ).not.to.be.reverted;

        expect(await aaveToken.balanceOf(this.swap.address)).to.be.at.least(
          params.seed_deposit.sub(1)
        );
      });

      it("Gets right balances", async function () {
        const vTokenBal: BigNumber = await this.swap.getTokenBalance(0);
        const aTokenBal: BigNumber = await this.swap.getTokenBalance(1);

        await expect(
          this.swap.addLiquidity(
            params.seed_deposit,
            ethers.constants.MaxUint256
          )
        ).not.to.be.reverted;

        expect(await this.swap.getTokenBalance(0)).to.be.equal(
          vTokenBal.add(params.seed_deposit)
        );
        expect(await this.swap.getTokenBalance(1)).to.be.at.least(
          aTokenBal.add(params.seed_deposit).sub(1)
        );

        // Reverts if we give a wrong index
        await expect(
          this.swap.getTokenBalance(2)
        ).to.be.revertedWithCustomError(this.swap, `WrongIndex`);
      });
    });

    describe("removeLiquidity", function () {
      beforeEach(async function () {
        await this.swap.addLiquidity(
          params.seed_deposit,
          ethers.constants.MaxUint256
        );

        expect(await this.swap.getTokenBalance(0)).to.be.equal(
          params.seed_deposit
        );
        expect(await this.swap.getTokenBalance(1)).to.be.at.least(
          params.seed_deposit.sub(1)
        );
        this.aaveToken = (await ethers.getContractAt(
          "IERC20Metadata",
          a.aave_usdc
        )) as ERC20Metadata;
        expect(
          await this.aaveToken.balanceOf(this.swap.address)
        ).to.be.at.least(params.seed_deposit.sub(1));
      });
      it("Reverts if the user tries to remove liquidity with 0 amount", async function () {
        await expect(
          this.swap.removeLiquidity(0, ethers.constants.MaxUint256)
        ).to.be.revertedWithCustomError(this.swap, `ZeroAmount`);
      });

      it("Doesn't revert if the user tries to remove liquidity with the full amount", async function () {
        const balVirtualLp: BigNumber = await this.swap.getVirtualLpBalance();
        await expect(
          this.swap.removeLiquidity(balVirtualLp, ethers.constants.MaxUint256)
        ).not.to.be.reverted;
      });

      it("Reverts if the withdrawer is not the owner", async function () {
        const vLpBal: BigNumber = await this.swap.getVirtualLpBalance();
        await expect(
          this.swap
            .connect(this.alice)
            .removeLiquidity(vLpBal.div(2), ethers.constants.MaxUint256)
        ).to.be.revertedWithCustomError(this.swap, `OnlyYakisoba`);
      });

      it("Doesn't revert if the withdrawer is the owner", async function () {
        const vLpBal: BigNumber = await this.swap.getVirtualLpBalance();
        await expect(
          this.swap.removeLiquidity(vLpBal.div(2), ethers.constants.MaxUint256)
        ).not.to.be.reverted;
      });

      it("Reverts if the timestamp is too low", async function () {
        await expect(
          this.swap.removeLiquidity(params.seed_deposit, 0)
        ).to.be.revertedWithCustomError(this.swap, `DeadlineCheck`);
      });

      it("Doesn't revert if the timestamp is high enough", async function () {
        const vLpBal: BigNumber = await this.swap.getVirtualLpBalance();
        await expect(
          this.swap.removeLiquidity(
            vLpBal.div(2),
            (await ethers.provider.getBlock("latest")).timestamp + 1000
          )
        ).not.to.be.reverted;
      });

      it("Sends tokens back to the user", async function () {
        const bal: BigNumber = await this.usdc.balanceOf(this.deployer.address);
        const vLpBal: BigNumber = await this.swap.getVirtualLpBalance();
        await expect(
          this.swap.removeLiquidity(vLpBal.div(2), ethers.constants.MaxUint256)
        ).not.to.be.reverted;

        const balAfter: BigNumber = await this.usdc.balanceOf(
          this.deployer.address
        );
        expect(balAfter.sub(bal)).to.be.greaterThan(0);
      });
    });
  });
  describe("Swaps", function () {
    beforeEach(async function () {
      await this.swap.addLiquidity(
        params.seed_deposit,
        ethers.constants.MaxUint256
      );

      expect(await this.swap.getTokenBalance(0)).to.be.equal(
        params.seed_deposit
      );
      expect(await this.swap.getTokenBalance(1)).to.be.at.least(
        params.seed_deposit.sub(1)
      );
      this.aaveToken = (await ethers.getContractAt(
        "IERC20Metadata",
        a.aave_usdc
      )) as ERC20Metadata;
      expect(await this.aaveToken.balanceOf(this.swap.address)).to.be.at.least(
        params.seed_deposit.sub(1)
      );

      const balAaveBefore: BigNumber = await this.aaveToken.balanceOf(
        this.swap.address
      );
    });
    describe("swapVirtualToAsset", function () {
      it("Swaps virtual tokens and sends assets to the user", async function () {
        const balBefore: BigNumber = await this.usdc.balanceOf(
          this.deployer.address
        );
        await expect(
          this.swap.swapVirtualToAsset(
            params.seed_deposit.div(10),
            0,
            ethers.constants.MaxInt256,
            this.deployer.address
          )
        ).not.to.be.reverted;
        expect(
          (await this.usdc.balanceOf(this.deployer.address)).sub(balBefore)
        ).to.be.greaterThan(0);
      });

      it("Swapping with 0 amount return 0", async function () {
        const bal = await this.usdc.balanceOf(this.deployer.address);
        this.swap.swapVirtualToAsset(
          0,
          0,
          ethers.constants.MaxInt256,
          this.deployer.address
        );
        expect(await this.usdc.balanceOf(this.deployer.address)).to.be.equal(
          bal
        );
      });

      it("Withdraws from Aave and sends to the user", async function () {
        const balBefore: BigNumber = await this.usdc.balanceOf(
          this.deployer.address
        );
        const aaveToken: ERC20 = (await ethers.getContractAt(
          "ERC20",
          a.aave_usdc
        )) as ERC20;

        const balAaveBefore: BigNumber = await aaveToken.balanceOf(
          this.swap.address
        );

        // We need to have some aave tokens in the contract
        expect(balAaveBefore).to.be.greaterThan(ethers.constants.Zero);

        await this.swap.swapVirtualToAsset(
          params.seed_deposit.div(10),
          0,
          ethers.constants.MaxInt256,
          this.deployer.address
        );

        // we should have received some USDC
        expect(
          (await this.usdc.balanceOf(this.deployer.address)).sub(balBefore)
        ).to.be.greaterThan(0);

        const balAaveAfter: BigNumber = await aaveToken.balanceOf(
          this.swap.address
        );

        // We should have less aave tokens in the contract
        expect(balAaveAfter).to.be.lessThan(balAaveBefore);
      });

      it("Reverts if minDy is not met", async function () {
        await expect(
          this.swap.swapVirtualToAsset(
            params.seed_deposit.div(10),
            ethers.constants.MaxUint256,
            ethers.constants.MaxInt256,
            this.deployer.address
          )
        ).to.be.revertedWith("Swap didn't result in min tokens");
      });

      it("Doesn't revert if minDy is 0", async function () {
        await expect(
          this.swap.swapVirtualToAsset(
            params.seed_deposit.div(10),
            0,
            ethers.constants.MaxInt256,
            this.deployer.address
          )
        ).not.to.be.reverted;
      });

      it("Reverts if deadline is too low", async function () {
        await expect(
          this.swap.swapVirtualToAsset(
            params.seed_deposit.div(10),
            0,
            0,
            this.deployer.address
          )
        ).to.be.revertedWithCustomError(this.swap, `DeadlineCheck`);
      });

      it("Doesn't revert if the deadline is high", async function () {
        await expect(
          this.swap.swapVirtualToAsset(
            params.seed_deposit.div(10),
            0,
            ethers.constants.MaxInt256,
            this.deployer.address
          )
        ).not.to.be.reverted;
      });

      it("Returns the swapped amount", async function () {
        const balBefore: BigNumber = await this.usdc.balanceOf(
          this.deployer.address
        );
        const swapAmount: BigNumber =
          await this.swap.callStatic.swapVirtualToAsset(
            params.seed_deposit.div(10),
            0,
            ethers.constants.MaxInt256,
            this.deployer.address
          );

        await this.swap.swapVirtualToAsset(
          params.seed_deposit.div(10),
          0,
          ethers.constants.MaxInt256,
          this.deployer.address
        );

        expect(swapAmount).to.be.greaterThan(0);
        expect(swapAmount.add(balBefore)).to.be.equal(
          await this.usdc.balanceOf(this.deployer.address)
        );
      });

      it("Reverts if the user is not the Yakisoba", async function () {
        await expect(
          this.swap
            .connect(this.alice)
            .swapVirtualToAsset(
              params.seed_deposit.div(10),
              0,
              ethers.constants.MaxInt256,
              this.deployer.address
            )
        ).to.be.revertedWithCustomError(this.swap, `OnlyYakisoba`);
      });

      it("Doesn't revert if the user is the Yakisoba", async function () {
        await expect(
          this.swap.swapVirtualToAsset(
            params.seed_deposit.div(10),
            0,
            ethers.constants.MaxInt256,
            this.deployer.address
          )
        ).not.to.be.reverted;
      });

      it("Produces an increasing slippage", async function () {
        const balBefore: BigNumber = await this.usdc.balanceOf(
          this.deployer.address
        );
        const swapAmount: BigNumber =
          await this.swap.callStatic.swapVirtualToAsset(
            params.seed_deposit.div(10),
            0,
            ethers.constants.MaxInt256,
            this.deployer.address
          );

        await this.swap.swapVirtualToAsset(
          params.seed_deposit.div(10),
          0,
          ethers.constants.MaxInt256,
          this.deployer.address
        );

        // We should get less USDC if we swap again
        const swapAmount2: BigNumber =
          await this.swap.callStatic.swapVirtualToAsset(
            params.seed_deposit.div(10),
            0,
            ethers.constants.MaxInt256,
            this.deployer.address
          );

        expect(swapAmount2).to.be.lessThan(swapAmount);
      });
    });

    describe("swapAssetToVirtual", function () {
      it("Swaps 0 amount and returns 0", async function () {
        const bal = await this.swap.getTokenBalance(0);
        // Returns 0
        expect(
          await this.swap.callStatic.swapAssetToVirtual(
            0,
            ethers.constants.MaxUint256
          )
        ).to.be.equal(0);

        await this.swap.swapAssetToVirtual(0, ethers.constants.MaxInt256);
        // Virtual balance is unchanged
        expect(await this.swap.getTokenBalance(0)).to.be.equal(bal);
      });

      it("Reverts if deadline is too low", async function () {
        await expect(
          this.swap.swapAssetToVirtual(params.seed_deposit.div(10), 0)
        ).to.be.revertedWithCustomError(this.swap, `DeadlineCheck`);
      });

      it("Swaps assets and decreases the virtual balance", async function () {
        const balAssetBefore: BigNumber = await this.usdc.balanceOf(
          this.deployer.address
        );
        const balVirtualBefore: BigNumber = await this.swap.getTokenBalance(0);
        await this.swap.swapAssetToVirtual(
          params.seed_deposit.div(10),
          ethers.constants.MaxInt256
        );
        expect(
          (await this.swap.getTokenBalance(0)).sub(balVirtualBefore)
        ).to.be.lessThan(0);
        expect(
          (await this.usdc.balanceOf(this.deployer.address)).sub(balAssetBefore)
        ).to.be.lessThan(0);
      });

      it("Reverts if the user is not the Yakisoba", async function () {
        await expect(
          this.swap
            .connect(this.alice)
            .swapAssetToVirtual(
              params.seed_deposit.div(10),
              ethers.constants.MaxInt256
            )
        ).to.be.revertedWithCustomError(this.swap, `OnlyYakisoba`);
      });

      it("Doesn't revert if the user is the Yakisoba", async function () {
        await expect(
          this.swap.swapAssetToVirtual(
            params.seed_deposit.div(10),
            ethers.constants.MaxInt256
          )
        ).to.not.be.reverted;
      });

      it("Deposits usdc into Aave", async function () {
        const balBefore: BigNumber = await this.usdc.balanceOf(
          this.deployer.address
        );
        const aave_usdc = (await ethers.getContractAt(
          "ERC20",
          a.aave_usdc
        )) as ERC20;
        const balAaveBefore: BigNumber = await aave_usdc.balanceOf(
          this.swap.address
        );
        await this.swap.swapAssetToVirtual(
          params.seed_deposit.div(10),
          ethers.constants.MaxInt256
        );
        expect(
          (await this.usdc.balanceOf(this.deployer.address)).sub(balBefore)
        ).to.be.lessThan(0);
        expect(
          (await aave_usdc.balanceOf(this.swap.address)).sub(balAaveBefore)
        ).to.be.greaterThan(0);
      });
      it("Returns the amount of virtual tokens swapped", async function () {
        const balBefore: BigNumber = await this.swap.getTokenBalance(0);
        const swapAmount: BigNumber =
          await this.swap.callStatic.swapAssetToVirtual(
            params.seed_deposit.div(10),
            ethers.constants.MaxInt256
          );

        await this.swap.swapAssetToVirtual(
          params.seed_deposit.div(10),
          ethers.constants.MaxInt256
        );

        expect(swapAmount).to.be.greaterThan(0);
        expect(balBefore.sub(swapAmount)).to.be.equal(
          await this.swap.getTokenBalance(0)
        );
      });
    });
  });

  describe("Fees/Rewards", function () {
    it("Withdraw underlying returns", async function () {
      const lendingPool: ILendingPool = (await ethers.getContractAt(
        "ILendingPool",
        a.aave_lending_pool
      )) as ILendingPool;

      const aaveUSDC: ERC20 = (await ethers.getContractAt(
        "ERC20",
        a.aave_usdc
      )) as ERC20;

      expect(await this.swap.getTokenBalance(0)).to.be.equal(0);
      expect(await aaveUSDC.balanceOf(this.swap.address)).to.be.equal(0);

      // If there is no aaveusc balance, it doesn't revert
      await expect(this.swap.withdrawUnderlyingReturns()).not.to.be.reverted;

      const balBefore: BigNumber = await this.usdc.balanceOf(
        this.deployer.address
      );

      await this.usdc.approve(lendingPool.address, params.seed_deposit);
      await expect(
        lendingPool.deposit(
          this.usdc.address,
          params.seed_deposit,
          this.swap.address,
          0
        )
      ).to.not.be.reverted;

      expect(await aaveUSDC.balanceOf(this.swap.address)).to.be.at.least(
        params.seed_deposit.sub(1)
      );
      expect(await this.swap.getTokenBalance(0)).to.be.equal(0);

      const balAaveBefore: BigNumber = await this.aave_usdc.balanceOf(
        this.swap.address
      );

      expect(await aaveUSDC.balanceOf(this.swap.address)).to.be.at.least(
        params.seed_deposit.sub(1)
      );

      // We can withdraw the excess aave usdc
      await expect(this.swap.withdrawUnderlyingReturns()).not.to.be.reverted;

      expect(await aaveUSDC.balanceOf(this.swap.address)).to.be.equal(0);
      expect(await this.usdc.balanceOf(this.deployer.address)).to.be.at.least(
        balBefore.sub(1)
      );
      // Reverts if caller is not the owner
      await expect(
        this.swap.connect(this.alice).withdrawUnderlyingReturns()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Creates config for rewards", async function () {
      await this.swap.setRewardsConfig(
        a.sturdy_incentives_controller,
        this.deployer.address
      );
      expect(await this.swap.incentivesController()).to.be.equal(
        a.sturdy_incentives_controller
      );

      expect(await this.swap.rewardsManager()).to.be.equal(
        this.deployer.address
      );

      // Reverts if caller is not the owner
      await expect(
        this.swap
          .connect(this.alice)
          .setRewardsConfig(
            a.sturdy_incentives_controller,
            this.deployer.address
          )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Claims rewards", async function () {
      await this.swap.setRewardsConfig(
        a.sturdy_incentives_controller,
        this.deployer.address
      );

      const rewardToken = (await ethers.getContractAt(
        "ERC20",
        a.lido_token
      )) as ERC20;

      const balBefore: BigNumber = await rewardToken.balanceOf(
        this.deployer.address
      );

      expect(await this.swap.callStatic.claimRewards()).to.be.equal(0);

      // Sturdy doesn't have any rewards yet but we can test the claim function
      expect(await this.swap.claimRewards())
        .to.emit(this.swap, "rewardClaimed")
        .withArgs(this.swap.address, this.deployer.address, 0);

      // Reverts if caller is not the owner
      await expect(
        this.swap.connect(this.alice).claimRewards()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Migrate", function () {
    it("Migrates assets", async function () {
      await this.swap.addLiquidity(
        params.seed_deposit,
        ethers.constants.MaxUint256
      );

      const balAaveBefore: BigNumber = await this.aave_usdc.balanceOf(
        this.swap.address
      );

      const balUSDCBeforeSwap: BigNumber = await this.usdc.balanceOf(
        this.swap.address
      );

      const balUSDCBeforeDeployer: BigNumber = await this.usdc.balanceOf(
        this.deployer.address
      );

      // Reverts if caller is not the yakisoba
      await expect(
        this.swap.connect(this.alice).migrate()
      ).to.be.revertedWithCustomError(this.swap, "OnlyYakisoba");

      expect(await this.swap.migrate()).not.to.be.reverted;
      expect(
        await this.usdc.balanceOf(this.deployer.address)
      ).to.be.greaterThan(balUSDCBeforeDeployer);
      expect(await this.usdc.balanceOf(this.swap.address)).to.be.equal(0);
      expect(await this.aave_usdc.balanceOf(this.swap.address)).to.be.equal(0);

      expect(await this.swap.migrated()).to.be.equal(true);

      // Reverts if already migrated
      await expect(this.swap.migrate()).to.be.revertedWithCustomError(
        this.swap,
        "MigrationError"
      );
    });

    it("Doesn't revert on failure", async function () {
      const MockERC20: ContractFactory = await ethers.getContractFactory(
        "MockERC20",
        this.deployer
      );
      const mockERC20 = (await MockERC20.deploy(
        "Mock USDC",
        "mUSDC",
        0
      )) as MockERC20;

      const MockAave: ContractFactory = await ethers.getContractFactory(
        "MockAaveFailMigration",
        this.deployer
      );
      const mockAave = (await MockAave.deploy(
        a.usdc,
        mockERC20.address
      )) as MockAaveFailMigration;
      await mockAave.deployed();

      const virtual_token = "0x0000000000000000000000000000000000000000";
      const aave_usdc_decimals: number = await (
        await ethers.getContractAt("IERC20Metadata", a.aave_usdc)
      ).decimals();

      const decimals: number[] = [aave_usdc_decimals, aave_usdc_decimals];
      const aave_tokens: String[] = [virtual_token, mockERC20.address];
      const real_tokens: String[] = [virtual_token, a.usdc];

      const swap: Swap = (await this.Swap.deploy(
        aave_tokens,
        real_tokens,
        decimals,
        params.initial_a,
        mockAave.address,
        this.deployer.address
      )) as Swap;

      await this.usdc.approve(swap.address, params.seed_deposit);
      await swap.addLiquidity(params.seed_deposit, ethers.constants.MaxUint256);

      await mockAave.setFail(true);
      expect(await swap.migrate()).not.to.be.reverted;
      expect(await swap.migrated()).to.be.equal(true);
    });

    it("Recovers assets", async function () {
      const MockERC20: ContractFactory = await ethers.getContractFactory(
        "MockERC20",
        this.deployer
      );
      const mockAaveUSDC = (await MockERC20.deploy(
        "Mock USDC",
        "mUSDC",
        0
      )) as MockERC20;

      const MockAave: ContractFactory = await ethers.getContractFactory(
        "MockAaveFailMigration",
        this.deployer
      );
      const mockAave = (await MockAave.deploy(
        a.usdc,
        mockAaveUSDC.address
      )) as MockAaveFailMigration;
      await mockAave.deployed();

      const virtual_token = "0x0000000000000000000000000000000000000000";
      const aave_usdc_decimals: number = await (
        await ethers.getContractAt("IERC20Metadata", a.aave_usdc)
      ).decimals();

      const decimals: number[] = [aave_usdc_decimals, aave_usdc_decimals];
      const aave_tokens: String[] = [virtual_token, mockAaveUSDC.address];
      const real_tokens: String[] = [virtual_token, a.usdc];

      const swap: Swap = (await this.Swap.deploy(
        aave_tokens,
        real_tokens,
        decimals,
        params.initial_a,
        mockAave.address,
        this.deployer.address
      )) as Swap;

      await this.usdc.approve(swap.address, params.seed_deposit);
      await swap.addLiquidity(params.seed_deposit, ethers.constants.MaxUint256);
      await mockAave.setFail(true);

      const balBefore: BigNumber = await mockAaveUSDC.balanceOf(swap.address);

      // Reverts if we haven't migrated
      await expect(swap.recoverAssets(balBefore)).to.be.revertedWithCustomError(
        this.swap,
        "MigrationError"
      );

      expect(await swap.migrate()).not.to.be.reverted;
      expect(await swap.migrated()).to.be.equal(true);

      await mockAave.setFail(false);

      mockAave.setMaxAmount(balBefore.sub(1));

      // Reverts if we try to recover more than the allowed amount
      await expect(swap.recoverAssets(balBefore)).to.be.reverted;

      // Reverts if the caller is not the owner
      await expect(
        swap.connect(this.alice).recoverAssets(balBefore.sub(1))
      ).to.be.revertedWith("Ownable: caller is not the owner");

      const balBeforeDeployer: BigNumber = await this.usdc.balanceOf(
        this.deployer.address
      );

      // Doesn't revert if we try to recover less than the allowed amount
      expect(await swap.recoverAssets(balBefore.sub(1))).not.to.be.reverted;

      // Expect to have burnt the amount passed in
      expect(await mockAaveUSDC.balanceOf(swap.address)).to.be.equal(1);

      expect(await swap.CRATE()).to.be.equal(this.deployer.address);
      expect(await this.usdc.balanceOf(this.deployer.address)).to.be.equal(
        balBeforeDeployer.add(balBefore.sub(1))
      );
    });
  });

  describe("Ramping", function () {
    it("Ramps A", async function () {
      await this.swap.addLiquidity(
        params.seed_deposit,
        ethers.constants.MaxUint256
      );

      const currentBlock: number = await ethers.provider.getBlockNumber();
      const currentTime: number = (await ethers.provider.getBlock(currentBlock))
        .timestamp;

      const sevenDays: number = 60 * 60 * 24 * 7;
      const rampEnd: number = currentTime + sevenDays + 1_000;
      const newA: BigNumber = ethers.BigNumber.from(
        (params.initial_a + 20).toString()
      );
      const precision: number = 100;

      await this.swap.rampA(newA, rampEnd);

      // Reverts if not owner
      await expect(
        this.swap.connect(this.alice).rampA(newA, rampEnd)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      const storage: any = await this.swap.swapStorage();

      expect(await this.swap.getA()).to.be.equal(params.initial_a);
      expect(storage.futureA).to.be.equal(newA.mul(precision));
      expect(storage.futureATime).to.be.equal(rampEnd);

      // A should be halfway between initial and final
      await time.increase(sevenDays / 2);
      expect(await this.swap.getA()).to.be.within(
        params.initial_a + (newA.toNumber() - params.initial_a) / 2 - 5,
        params.initial_a + (newA.toNumber() - params.initial_a) / 2 + 5
      );

      expect(await this.swap.getAPrecise()).to.be.within(
        params.initial_a * precision +
          ((newA.toNumber() - params.initial_a) * precision) / 2 -
          5,

        params.initial_a * precision +
          ((newA.toNumber() - params.initial_a) * precision) / 2 +
          5
      );

      // A should be final after ramp
      await time.increase(sevenDays + 1_000 / 2);
      expect(await this.swap.getA()).to.be.within(
        newA.toNumber() - 5,
        newA.toNumber() + 5
      );
      expect(await this.swap.getAPrecise()).to.be.equal(
        newA.toNumber() * precision
      );
    });

    it("Reverts if ramping A with invalid params", async function () {
      await this.swap.addLiquidity(
        params.seed_deposit,
        ethers.constants.MaxUint256
      );

      async function getRampEnd() {
        const currentBlock: number = await ethers.provider.getBlockNumber();
        const currentTime: number = (
          await ethers.provider.getBlock(currentBlock)
        ).timestamp;
        const sevenDays: number = 60 * 60 * 24 * 7;
        return currentTime + sevenDays + 1;
      }
      const sevenDays: number = 60 * 60 * 24 * 7;
      const newA: BigNumber = ethers.BigNumber.from(
        (params.initial_a + 20).toString()
      );
      const precision: number = 100;
      await expect(
        this.swap.rampA(newA, (await getRampEnd()) - sevenDays)
      ).to.be.revertedWith("Insufficient ramp time");

      await expect(this.swap.rampA(0, await getRampEnd())).to.be.revertedWith(
        "futureA_ must be > 0 and < MAX_A"
      );

      await expect(
        this.swap.rampA(ethers.constants.MaxInt256, await getRampEnd())
      ).to.be.revertedWith("futureA_ must be > 0 and < MAX_A");

      const initialAPrecise: BigNumber = await this.swap.getAPrecise();
      await expect(
        this.swap.rampA(initialAPrecise.div(2).sub(1), await getRampEnd())
      ).to.be.revertedWith("futureA_ is too large");

      await this.swap.rampA(newA, getRampEnd());
      await expect(
        this.swap.rampA(newA.add(1), getRampEnd())
      ).to.be.revertedWith("Wait 1 day before starting ramp");
    });

    it("Stops ramping A", async function () {
      await this.swap.addLiquidity(
        params.seed_deposit,
        ethers.constants.MaxUint256
      );

      const currentBlock: number = await ethers.provider.getBlockNumber();
      const currentTime: number = (await ethers.provider.getBlock(currentBlock))
        .timestamp;

      const sevenDays: number = 60 * 60 * 24 * 7;
      const rampEnd: number = currentTime + sevenDays + 1;
      const newA: BigNumber = ethers.BigNumber.from(
        (params.initial_a + 20).toString()
      );
      const precision: number = 100;
      await this.swap.rampA(newA, rampEnd);

      const storage: any = await this.swap.swapStorage();

      expect(await this.swap.getA()).to.be.equal(params.initial_a);
      expect(storage.futureA).to.be.equal(newA.mul(precision));
      expect(storage.futureATime).to.be.equal(rampEnd);

      // A should be halfway between initial and final
      await time.increase(sevenDays / 2);
      expect(await this.swap.getA()).to.be.equal(
        params.initial_a + (newA.toNumber() - params.initial_a) / 2
      );

      expect(await this.swap.getAPrecise()).to.be.equal(
        params.initial_a * precision +
          ((newA.toNumber() - params.initial_a) * precision) / 2
      );

      // We stop ramping
      expect(await this.swap.stopRampA()).not.to.be.reverted;

      // A should be halfway between initial and final
      expect(await this.swap.getA()).to.be.equal(
        params.initial_a + (newA.toNumber() - params.initial_a) / 2
      );

      expect(await this.swap.getAPrecise()).to.be.equal(
        params.initial_a * precision +
          ((newA.toNumber() - params.initial_a) * precision) / 2
      );

      // We increase time
      await time.increase(sevenDays / 2);

      // A should have stopped ramping
      expect(await this.swap.getA()).to.be.equal(
        params.initial_a + (newA.toNumber() - params.initial_a) / 2
      );

      expect(await this.swap.getAPrecise()).to.be.equal(
        params.initial_a * precision +
          ((newA.toNumber() - params.initial_a) * precision) / 2
      );

      // We try to stop ramping again
      await time.increase(sevenDays / 2 + 10);
      await expect(this.swap.stopRampA()).to.be.revertedWith(
        "Ramp is already stopped"
      );
    });

    it("Ramping moves the exchange rate", async function () {
      await this.swap.addLiquidity(
        params.seed_deposit,
        ethers.constants.MaxUint256
      );

      const dyBefore: BigNumber = await this.swap.callStatic.swapAssetToVirtual(
        params.seed_deposit.div(2),
        ethers.constants.MaxUint256
      );

      // We ramp A
      const currentBlock: number = await ethers.provider.getBlockNumber();
      const currentTime: number = (await ethers.provider.getBlock(currentBlock))
        .timestamp;

      const sevenDays: number = 60 * 60 * 24 * 7;
      const rampEnd: number = currentTime + sevenDays + 1_000;
      const newA: BigNumber = ethers.BigNumber.from(
        (params.initial_a + 200).toString()
      );
      const precision: number = 100;
      await this.swap.rampA(newA, rampEnd);

      // We increase time
      await time.increase(sevenDays + 1);

      expect(
        await this.swap.callStatic.swapAssetToVirtual(
          params.seed_deposit.div(2),
          ethers.constants.MaxUint256
        )
      ).to.be.greaterThan(dyBefore);
    });

    it("Stop ramping A is not callable by non-owner", async function () {
      await expect(
        this.swap.connect(this.alice).stopRampA()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("View functions", function () {
    it("Gets asset balance", async function () {
      await this.swap.addLiquidity(
        params.seed_deposit,
        ethers.constants.MaxUint256
      );

      expect(await this.swap.getAssetBalance()).to.be.at.least(
        params.seed_deposit.sub(1)
      );
    });

    it("Gets virtual price", async function () {
      await this.swap.addLiquidity(
        params.seed_deposit,
        ethers.constants.MaxUint256
      );

      // Roundin errors
      expect(await this.swap.getVirtualPrice()).to.be.at.least(
        ethers.BigNumber.from("999999994999999999")
      );
    });

    it("Gets Pooled tokens", async function () {
      await this.swap.addLiquidity(
        params.seed_deposit,
        ethers.constants.MaxUint256
      );

      expect(await this.swap.getPooledToken(0)).to.be.equal(
        ethers.constants.AddressZero
      );

      expect(await this.swap.getPooledToken(1)).to.be.equal(a.aave_usdc);

      await expect(this.swap.getPooledToken(2)).to.be.revertedWithCustomError(
        this.Swap,
        "WrongIndex"
      );
    });

    it("Gets Pooled token index", async function () {
      await this.swap.addLiquidity(
        params.seed_deposit,
        ethers.constants.MaxUint256
      );

      expect(await this.swap.getPooledTokenIndex(a.aave_usdc)).to.be.equal(1);

      expect(
        await this.swap.getPooledTokenIndex(ethers.constants.AddressZero)
      ).to.be.equal(0);

      await expect(
        this.swap.getPooledTokenIndex(a.usdc)
      ).to.be.revertedWithCustomError(this.Swap, "WrongToken");
    });

    it("Calculates Swap", async function () {
      await this.swap.addLiquidity(
        params.seed_deposit,
        ethers.constants.MaxUint256
      );

      const dy = await this.swap.callStatic.swapAssetToVirtual(
        params.seed_deposit.div(2),
        ethers.constants.MaxUint256
      );

      expect(dy).to.be.equal(
        await this.swap.calculateSwap(1, 0, params.seed_deposit.div(2))
      );

      await expect(
        this.swap.calculateSwap(0, 2, params.seed_deposit.div(2))
      ).to.be.revertedWith("Token index out of range");
    });

    it("Calculates Asset to Virtual Swap", async function () {
      await this.swap.addLiquidity(
        params.seed_deposit,
        ethers.constants.MaxUint256
      );

      const dy: BigNumber = await this.swap.callStatic.swapAssetToVirtual(
        params.seed_deposit.div(2),
        ethers.constants.MaxUint256
      );

      expect(dy).to.be.equal(
        await this.swap.calculateAssetToVirtual(params.seed_deposit.div(2))
      );
    });

    it("Calculates Virtual to Asset Swap", async function () {
      await this.swap.addLiquidity(
        params.seed_deposit,
        ethers.constants.MaxUint256
      );

      const dy: BigNumber = await this.swap.callStatic.swapVirtualToAsset(
        params.seed_deposit.div(2),
        ethers.constants.Zero,
        ethers.constants.MaxUint256,
        this.deployer.address
      );

      expect(dy).to.be.equal(
        await this.swap.calculateVirtualToAsset(params.seed_deposit.div(2))
      );
    });

    it("Gets virtual LP balance", async function () {
      await this.swap.addLiquidity(
        params.seed_deposit,
        ethers.constants.MaxUint256
      );

      expect(await this.swap.getVirtualLpBalance()).to.be.greaterThan(
        params.seed_deposit
      );
    });

    it("Gets return balance", async function () {
      await this.swap.addLiquidity(
        params.seed_deposit,
        ethers.constants.MaxUint256
      );

      expect(await this.swap.getReturnsBalance()).to.be.at.least(
        ethers.constants.Zero
      );
    });
  });
});
