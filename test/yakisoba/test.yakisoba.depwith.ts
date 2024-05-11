const { expect } = require("chai");

import * as fxt from "../utils/fixtures";

import { BigNumber, Contract } from "ethers";
import { ethers, upgrades } from "hardhat";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import a from "../utils/mainnet-adresses";
import assert from "assert";
import params from "../utils/params";

describe("test.yakisoba.depwith", function () {
  this.beforeEach(async function () {
    this.deployer = await fxt.getDeployer();

    this.yakisoba = await fxt.deployYakisoba(this.deployer);
    this.usdc = await fxt.getUSDCToken(this.deployer);
    await fxt.getUSDC(this.deployer);
    this.decimals = await this.usdc.decimals();
    this.yakisoba.setFees(0, 0, 0);
  });

  describe("Deposit", function () {
    this.beforeEach(async function () {
      // We unpause to allow withdraws
      await this.yakisoba.unpause();
      expect(await this.yakisoba.paused()).to.equal(false);

      // We increase maxTotalAssets to allow deposits
      await this.yakisoba.setMaxTotalAssets(ethers.constants.MaxUint256);

      // This has deposited a $seed_deposit amount of USDC
      expect(await this.yakisoba.totalSupply()).to.equal(params.seed_deposit);

      // We can save the balances after the initial deposit
      this.balanceEOABefore = await this.usdc.balanceOf(this.deployer.address);
      this.balanceYakisobaBefore = await this.usdc.balanceOf(this.yakisoba.address);

      // We save the decimals
      this.decimals = await this.usdc.decimals();

      // We can check that the balances are correct
      expect(this.balanceYakisobaBefore).to.equal(params.seed_deposit);
      expect(await this.yakisoba.totalSupply()).to.equal(params.seed_deposit);
      expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
        params.seed_deposit
      );
      expect(await this.yakisoba.sharePrice()).to.equal(
        ethers.utils.parseUnits("1", this.decimals)
      );
    });

    describe("Mint", function () {
      it("Reverts if paused", async function () {
        await this.yakisoba.pause();
        expect(await this.yakisoba.paused()).to.equal(true);

        await expect(
          this.yakisoba.mint(params.seed_deposit, this.deployer.address)
        )
          .to.be.revertedWithCustomError(this.yakisoba, "AmountTooHigh")
          .withArgs(0);
      });
      it("Reverts if receiver is the yakisoba", async function () {
        await expect(
          this.yakisoba.mint(params.seed_deposit, this.yakisoba.address)
        ).to.be.revertedWithCustomError(this.yakisoba, "YakisobaCantBeReceiver");
      });

      it("Reverts if amount is too high", async function () {
        // Set max total assets to 2e8
        await this.yakisoba.setMaxTotalAssets(params.seed_deposit.mul(2));
        expect(await this.yakisoba.totalAssets()).to.equal(params.seed_deposit);
        expect(await this.yakisoba.maxDeposit(this.deployer.address)).to.equal(
          params.seed_deposit
        );
        // Mint 2e8 shares - should revert
        await expect(
          this.yakisoba.mint(params.seed_deposit.mul(2), this.deployer.address)
        )
          .to.be.revertedWithCustomError(this.yakisoba, "AmountTooHigh")
          .withArgs(params.seed_deposit);
        // Should pass if we deposit less
        await this.yakisoba.mint(params.seed_deposit, this.deployer.address);
      });

      it("Reverts if depositor doesn't have enough USDC", async function () {
        expect(await this.yakisoba.maxTotalAssets()).to.equal(
          ethers.constants.MaxUint256
        );
        expect(await this.yakisoba.sharePrice()).to.equal(
          ethers.utils.parseUnits("1", this.decimals)
        );
        await expect(
          this.yakisoba.mint(this.balanceEOABefore.add(1), this.deployer.address)
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      });

      it("Transfers USDC to the yakisoba", async function () {
        expect(await this.yakisoba.totalAssets()).to.equal(params.seed_deposit);
        expect(await this.yakisoba.sharePrice()).to.equal(
          ethers.utils.parseUnits("1", this.decimals)
        );
        expect(await this.usdc.balanceOf(this.yakisoba.address)).to.equal(
          params.seed_deposit
        );
        expect(await this.usdc.balanceOf(this.deployer.address)).to.equal(
          this.balanceEOABefore
        );
        this.yakisoba.mint(params.seed_deposit, this.deployer.address);
        expect(await this.yakisoba.totalAssets()).to.equal(
          params.seed_deposit.mul(2)
        );
        expect(await this.yakisoba.sharePrice()).to.equal(
          ethers.utils.parseUnits("1", this.decimals)
        );
        expect(await this.usdc.balanceOf(this.yakisoba.address)).to.equal(
          params.seed_deposit.mul(2)
        );
        expect(await this.usdc.balanceOf(this.deployer.address)).to.equal(
          this.balanceEOABefore.sub(params.seed_deposit)
        );
      });

      it("Mint shares", async function () {
        // Mint 1e8 shares - check return value
        expect(
          await this.yakisoba.callStatic.mint(
            params.seed_deposit,
            this.deployer.address
          )
        ).to.equal(params.seed_deposit);
        // Mint 1e8 shares
        await this.yakisoba.mint(params.seed_deposit, this.deployer.address);
        expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
          params.seed_deposit.mul(2)
        );
        expect(
          await this.yakisoba.mint(params.seed_deposit, this.deployer.address)
        )
          .to.emit(this.yakisoba, "Deposit")
          .withArgs(
            this.deployer.address,
            this.deployer.address,
            params.seed_deposit,
            params.seed_deposit
          );
      });

      it("Mint shares with a different share price", async function () {
        // Share price is 1e6
        expect(await this.yakisoba.sharePrice()).to.equal(
          ethers.utils.parseUnits("1", this.decimals)
        );

        // Deposit 1e8
        await this.usdc.transfer(this.yakisoba.address, params.seed_deposit);
        expect(await this.yakisoba.totalAssets()).to.equal(
          params.seed_deposit.mul(2)
        );

        // Share price is 2e6
        expect(await this.yakisoba.sharePrice()).to.equal(
          ethers.utils.parseUnits("2", this.decimals)
        );

        // We should get 0.5e8 shares due to the share price being 2e6
        // This allows us to test the return value of deposit()
        expect(
          await this.yakisoba.callStatic.mint(
            params.seed_deposit,
            this.deployer.address
          )
        ).to.equal(params.seed_deposit.mul(2));

        // Mint 1e8 shares
        await this.yakisoba.mint(params.seed_deposit, this.deployer.address);

        // We got 1e8 shares due to the share price being 2e6
        expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
          params.seed_deposit.add(params.seed_deposit)
        );

        expect(await this.yakisoba.totalAssets()).to.equal(
          params.seed_deposit.mul(4)
        );

        // Share price is still 2e6
        expect(await this.yakisoba.sharePrice()).to.equal(
          ethers.utils.parseUnits("2", this.decimals)
        );
      });
    });

    describe("No Liquidity pool", function () {
      describe("Simple deposit", function () {
        it("Reverts if the yakisoba is paused", async function () {
          await this.yakisoba.pause();
          expect(await this.yakisoba.paused()).to.equal(true);
          await expect(
            this.yakisoba.deposit(params.seed_deposit, this.deployer.address)
          )
            .to.be.revertedWithCustomError(this.yakisoba, "AmountTooHigh")
            .withArgs(0);
        });

        it("Revert if receiver is the yakisoba", async function () {
          await expect(
            this.yakisoba.deposit(params.seed_deposit, this.yakisoba.address)
          ).to.be.revertedWithCustomError(this.yakisoba, "YakisobaCantBeReceiver");
        });

        it("Revert if amount is 0", async function () {
          await expect(
            this.yakisoba.deposit(ethers.constants.Zero, this.deployer.address)
          ).to.be.revertedWithCustomError(this.yakisoba, "AmountZero");
        });

        it("Revert if amount is too high", async function () {
          // Set maxTotalAssets to 2x seed_deposit
          expect(await this.yakisoba.totalAssets()).to.equal(params.seed_deposit);
          await this.yakisoba.setMaxTotalAssets(params.seed_deposit.mul(2));

          // Deposit 2x seed_deposit, we already have 1e8
          // So we should revert
          await expect(
            this.yakisoba.deposit(
              params.seed_deposit.mul(2),
              this.deployer.address
            )
          )
            .to.be.revertedWithCustomError(this.yakisoba, "AmountTooHigh")
            .withArgs(params.seed_deposit);
        });

        it("Reverts if the depositor doesn't have enough USDC", async function () {
          await expect(
            this.yakisoba.deposit(
              this.balanceEOABefore.add(1),
              this.deployer.address
            )
          ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });

        it("Transfer USDC to the yakisoba", async function () {
          // Deposit 1e8
          await expect(
            this.yakisoba.deposit(params.seed_deposit, this.deployer.address)
          )
            .to.emit(this.yakisoba, "Deposit")
            .withArgs(
              this.deployer.address,
              this.deployer.address,
              params.seed_deposit,
              params.seed_deposit
            );

          // Check balances
          const balanceYakisobaAfter: BigNumber = await this.usdc.balanceOf(
            this.yakisoba.address
          );
          const balanceEOAAfter: BigNumber = await this.usdc.balanceOf(
            this.deployer.address
          );

          // Yakisoba balance is before + 1e8
          expect(balanceYakisobaAfter).to.equal(
            this.balanceYakisobaBefore.add(params.seed_deposit)
          );
          // EOA balance is before - 1e8
          expect(balanceEOAAfter).to.equal(
            this.balanceEOABefore.sub(params.seed_deposit)
          );
        });

        it("Deposit and mint shares", async function () {
          // Deposit 2e8
          this.yakisoba.deposit(params.seed_deposit, this.deployer.address);
          expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
            params.seed_deposit.mul(2)
          );

          // Deposit again
          await this.yakisoba.deposit(params.seed_deposit, this.deployer.address);

          // Balance is 3e8
          expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
            params.seed_deposit.mul(3)
          );

          // Total supply is 3e8
          expect(await this.yakisoba.totalSupply()).to.equal(
            params.seed_deposit.mul(3)
          );

          // Total assets is 3e8
          expect(await this.yakisoba.totalAssets()).to.equal(
            params.seed_deposit.mul(3)
          );

          // Share price is still 1e6
          expect(await this.yakisoba.sharePrice()).to.equal(
            ethers.utils.parseUnits("1", 6)
          );
        });

        it("Deposit and mint shares with a different share price", async function () {
          // Share price is 1e6
          expect(await this.yakisoba.sharePrice()).to.equal(
            ethers.utils.parseUnits("1", this.decimals)
          );

          // Deposit 1e8
          await this.usdc.transfer(this.yakisoba.address, params.seed_deposit);
          expect(await this.yakisoba.totalAssets()).to.equal(
            params.seed_deposit.mul(2)
          );

          // Share price is 2e6
          expect(await this.yakisoba.sharePrice()).to.equal(
            ethers.utils.parseUnits("2", this.decimals)
          );

          // We should get 0.5e8 shares due to the share price being 2e6
          // This allows us to test the return value of deposit()
          expect(
            await this.yakisoba.callStatic.deposit(
              params.seed_deposit,
              this.deployer.address
            )
          ).to.equal(params.seed_deposit.div(2));
          // Deposit 1e8
          await this.yakisoba.deposit(params.seed_deposit, this.deployer.address);

          // We got 0.5e8 shares due to the share price being 2e6
          expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
            params.seed_deposit.add(params.seed_deposit.div(2))
          );

          // Share price is still 2e6
          expect(await this.yakisoba.sharePrice()).to.equal(
            ethers.utils.parseUnits("2", this.decimals)
          );
        });
      });
      describe("SafeDeposit", function () {
        it("Reverts if paused", async function () {
          await this.yakisoba.pause();
          expect(await this.yakisoba.paused()).to.equal(true);

          await expect(
            this.yakisoba.safeDeposit(
              params.seed_deposit,
              this.deployer.address,
              0,
              0
            )
          )
            .to.be.revertedWithCustomError(this.yakisoba, "AmountTooHigh")
            .withArgs(0);
        });

        it("Reverts if deadline is reached", async function () {
          await expect(
            this.yakisoba.safeDeposit(
              params.seed_deposit,
              this.deployer.address,
              0,
              0
            )
          ).to.be.revertedWithCustomError(this.yakisoba, "TransactionExpired");
        });

        it("Reverts if we don't get enough shares", async function () {
          await expect(
            this.yakisoba.safeDeposit(
              params.seed_deposit,
              this.deployer.address,
              ethers.constants.MaxUint256,
              ethers.constants.MaxUint256
            )
          )
            .to.be.revertedWithCustomError(this.yakisoba, "IncorrectShareAmount")
            .withArgs(params.seed_deposit);
        });
      });
    });
  });

  describe("Withdraw", function () {
    beforeEach(async function () {
      this.alice = await fxt.getAlice();
      this.bob = await fxt.getBob();

      await this.yakisoba.unpause();
      expect(await this.yakisoba.paused()).to.equal(false);

      // We seed the yakisoba with 1e8 USDC
      await this.yakisoba.setMaxTotalAssets(ethers.constants.MaxUint256);
      expect(await this.yakisoba.totalSupply()).to.equal(params.seed_deposit);
      expect(await this.yakisoba.totalAssets()).to.equal(params.seed_deposit);

      // We can save the balances after the initial deposit
      this.balanceEOABefore = await this.usdc.balanceOf(this.deployer.address);
      this.balanceYakisobaBefore = await this.usdc.balanceOf(this.yakisoba.address);
      this.yakisoba.setFees(0, 0, 0);
    });

    describe("No liqudidity pool", function () {
      describe("Simple withdraw", function () {
        it("Reverts if paused", async function () {
          await this.yakisoba.pause();
          expect(await this.yakisoba.paused()).to.equal(true);

          await expect(
            this.yakisoba.withdraw(
              params.seed_deposit,
              this.deployer.address,
              this.deployer.address
            )
          ).to.be.revertedWith("Pausable: paused");
        });
        it("Reverts if the amount is 0", async function () {
          await expect(
            this.yakisoba.withdraw(0, this.deployer.address, this.deployer.address)
          ).to.be.revertedWithCustomError(this.yakisoba, "AmountZero");
        });

        it("Reverts if the withdrawer isn't the caller and has no allowance", async function () {
          // Withdraw 1e8 with Alice as the withdrawer
          await expect(
            this.yakisoba
              .connect(this.alice)
              .withdraw(
                params.seed_deposit,
                this.alice.address,
                this.deployer.address
              )
          ).to.be.revertedWith("ERC20: insufficient allowance");

          // Should work when the withdrawer is the caller
          await expect(
            this.yakisoba.withdraw(
              params.seed_deposit.div(2),
              this.deployer.address,
              this.deployer.address
            )
          );

          // Should work when we have given Alice an allowance
          await this.yakisoba.increaseAllowance(
            this.alice.address,
            params.seed_deposit
          );

          expect(
            await this.yakisoba.allowance(
              this.deployer.address,
              this.alice.address
            )
          ).to.equal(params.seed_deposit);
          await this.yakisoba
            .connect(this.alice)
            .withdraw(
              params.seed_deposit.div(2),
              this.alice.address,
              this.deployer.address
            );

          // Allowance should be reduced
          expect(
            await this.yakisoba.allowance(
              this.deployer.address,
              this.alice.address
            )
          ).to.equal(params.seed_deposit.div(2));

          // Should work when we have given Alice an infinite allowance
          await this.yakisoba.approve(
            this.alice.address,
            ethers.constants.MaxUint256
          );
          expect(
            await this.yakisoba.allowance(
              this.deployer.address,
              this.alice.address
            )
          ).to.equal(ethers.constants.MaxUint256);

          // We redeposit some
          await this.yakisoba.deposit(params.seed_deposit, this.deployer.address);

          expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
            params.seed_deposit
          );

          // We withdraw with Alice as the withdrawer
          await this.yakisoba
            .connect(this.alice)
            .withdraw(
              params.seed_deposit.div(2),
              this.alice.address,
              this.deployer.address
            );

          // Allowance should still be infinite
          expect(
            await this.yakisoba.allowance(
              this.deployer.address,
              this.alice.address
            )
          ).to.equal(ethers.constants.MaxUint256);
        });

        it("Reverts if the withdrawer doesn't have enough shares", async function () {
          await expect(
            this.yakisoba.withdraw(
              params.seed_deposit.mul(2),
              this.deployer.address,
              this.deployer.address
            )
          ).to.be.revertedWith("ERC20: burn amount exceeds balance");
        });

        it("Burn the shares", async function () {
          expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
            params.seed_deposit
          );

          // We withdraw 1e8
          await this.yakisoba.withdraw(
            params.seed_deposit,
            this.deployer.address,
            this.deployer.address
          );

          // We should have 0 shares
          expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(0);
        });

        it("Burns the correct amount of shares with a different share price", async function () {
          // We send 1e8 USDC
          await this.usdc.transfer(this.yakisoba.address, params.seed_deposit);

          // We check that the share price is 2
          expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
            params.seed_deposit
          );
          expect(await this.yakisoba.totalSupply()).to.equal(params.seed_deposit);
          expect(await this.yakisoba.totalAssets()).to.equal(
            params.seed_deposit.mul(2)
          );
          expect(await this.yakisoba.sharePrice()).to.equal(
            ethers.utils.parseUnits("2", this.decimals)
          );

          // We withdraw seed_deposit*2
          await this.yakisoba.withdraw(
            params.seed_deposit.mul(2),
            this.deployer.address,
            this.deployer.address
          );
          // We should have 0 shares left
          expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
            ethers.constants.Zero
          );
        });

        it("Transfers the underlying", async function () {
          const balBefore: BigNumber = await this.usdc.balanceOf(
            this.deployer.address
          );

          //We withdraw 1e8/2
          await this.yakisoba.withdraw(
            params.seed_deposit.div(2),
            this.deployer.address,
            this.deployer.address
          );

          expect(await this.usdc.balanceOf(this.deployer.address)).to.equal(
            balBefore.add(params.seed_deposit.div(2))
          );

          const balAliceBefore: BigNumber = await this.usdc.balanceOf(
            this.alice.address
          );

          // We check that the receiver can be different from the caller
          await this.yakisoba.withdraw(
            params.seed_deposit.div(2),
            this.alice.address,
            this.deployer.address
          );

          expect(await this.usdc.balanceOf(this.alice.address)).to.equal(
            balAliceBefore.add(params.seed_deposit.div(2))
          );
        });

        it("Reverts if we don't have enough funds", async function () {
          const allocator: Contract = await fxt.deployHomeAllocator(
            this.deployer
          );

          await allocator.deployed();
          const home_chain_id = (await ethers.provider.getNetwork()).chainId;
          await expect(
            this.yakisoba.addChain(
              home_chain_id,
              ethers.constants.MaxUint256,
              allocator.address,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.HashZero
            )
          ).not.to.be.reverted;

          await this.yakisoba.dispatchAssets(
            [this.usdc.balanceOf(this.yakisoba.address)],
            [this.usdc.balanceOf(this.yakisoba.address)],
            [home_chain_id],
            [0],
            [ethers.constants.HashZero]
          );

          // We have 0 funds in the yakisoba
          expect(await this.usdc.balanceOf(this.yakisoba.address)).to.equal(0);
          expect(await this.yakisoba.liquidityPoolEnabled()).to.equal(false);

          // We try to withdraw
          await expect(
            this.yakisoba.withdraw(
              params.seed_deposit.div(2),
              this.deployer.address,
              this.deployer.address
            )
          )
            .to.be.revertedWithCustomError(this.yakisoba, "InsufficientFunds")
            .withArgs(ethers.constants.Zero);
        });

        it("Returns the withdraw amount we asked for", async function () {
          // We withdraw 1e8/2
          expect(
            await this.yakisoba.callStatic.withdraw(
              params.seed_deposit.div(2),
              this.deployer.address,
              this.deployer.address
            )
          ).to.equal(params.seed_deposit.div(2));
        });

        it("Takes fees on withdraw()", async function () {
          const balUSDCBefore: BigNumber = await this.usdc.balanceOf(
            this.deployer.address
          );

          const balYakisobaBefore: BigNumber = await this.yakisoba.balanceOf(
            this.deployer.address
          );

          await this.yakisoba.setFees(0, 0, 200);

          await expect(
            this.yakisoba.withdraw(
              params.seed_deposit.div(10),
              this.deployer.address,
              this.deployer.address
            )
          ).not.to.be.reverted;

          expect(await this.usdc.balanceOf(this.deployer.address)).to.equal(
            balUSDCBefore.add(params.seed_deposit.div(10))
          );

          expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
            balYakisobaBefore.sub(
              params.seed_deposit
                .div(10)
                .mul(10000)
                .div(10000 - 200)
            )
          );
        });

        it("Takes fees on safeWithdraw()", async function () {
          const balUSDCBefore: BigNumber = await this.usdc.balanceOf(
            this.deployer.address
          );

          const balYakisobaBefore: BigNumber = await this.yakisoba.balanceOf(
            this.deployer.address
          );

          await this.yakisoba.setFees(0, 0, 200);

          await expect(
            this.yakisoba.safeWithdraw(
              params.seed_deposit.div(10),
              0,
              ethers.constants.MaxUint256,
              this.deployer.address,
              this.deployer.address
            )
          ).not.to.be.reverted;

          expect(await this.usdc.balanceOf(this.deployer.address)).to.equal(
            balUSDCBefore.add(params.seed_deposit.div(10))
          );

          expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
            balYakisobaBefore.sub(
              params.seed_deposit
                .div(10)
                .mul(10000)
                .div(10000 - 200)
            )
          );
        });

        it("Takes fees on redeem()", async function () {
          const balUSDCBefore: BigNumber = await this.usdc.balanceOf(
            this.deployer.address
          );

          const balYakisobaBefore: BigNumber = await this.yakisoba.balanceOf(
            this.deployer.address
          );

          await this.yakisoba.setFees(0, 0, 200);

          await expect(
            this.yakisoba.redeem(
              params.seed_deposit.div(10),
              this.deployer.address,
              this.deployer.address
            )
          ).not.to.be.reverted;

          expect(await this.usdc.balanceOf(this.deployer.address)).to.equal(
            balUSDCBefore.add(
              params.seed_deposit
                .div(10)
                .mul(10000 - 200)
                .div(10000)
            )
          );

          expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
            balYakisobaBefore.sub(params.seed_deposit.div(10))
          );
        });

        it("Takes fees on safeRedeem()", async function () {
          const balUSDCBefore: BigNumber = await this.usdc.balanceOf(
            this.deployer.address
          );

          const balYakisobaBefore: BigNumber = await this.yakisoba.balanceOf(
            this.deployer.address
          );

          await this.yakisoba.setFees(0, 0, 200);

          await expect(
            this.yakisoba.safeRedeem(
              params.seed_deposit.div(10),
              0,
              ethers.constants.MaxUint256,
              this.deployer.address,
              this.deployer.address
            )
          ).not.to.be.reverted;

          expect(await this.usdc.balanceOf(this.deployer.address)).to.equal(
            balUSDCBefore.add(
              params.seed_deposit
                .div(10)
                .mul(10000 - 200)
                .div(10000)
            )
          );

          expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
            balYakisobaBefore.sub(params.seed_deposit.div(10))
          );
        });

        it("Emits a Withdraw event", async function () {
          // Same msg.sender and withdrawer and owner
          await expect(
            this.yakisoba.withdraw(
              params.seed_deposit.div(10),
              this.deployer.address,
              this.deployer.address
            )
          )
            .to.emit(this.yakisoba, "Withdraw")
            .withArgs(
              this.deployer.address,
              this.deployer.address,
              this.deployer.address,
              params.seed_deposit.div(10),
              params.seed_deposit.div(10)
            );

          // Different msg.sender and (withdrawer == owner)
          this.yakisoba.increaseAllowance(this.alice.address, params.seed_deposit);
          expect(
            await this.yakisoba.allowance(
              this.deployer.address,
              this.alice.address
            )
          ).to.equal(params.seed_deposit);

          expect(
            await this.yakisoba
              .connect(this.alice)
              .withdraw(
                params.seed_deposit.div(10),
                this.deployer.address,
                this.deployer.address
              )
          )
            .to.emit(this.yakisoba, "Withdraw")
            .withArgs(
              this.alice.address,
              this.deployer.address,
              this.deployer.address,
              params.seed_deposit.div(10),
              params.seed_deposit.div(10)
            );

          await expect(
            this.yakisoba
              .connect(this.alice)
              .withdraw(
                params.seed_deposit.div(10),
                this.alice.address,
                this.deployer.address
              )
          )
            .to.emit(this.yakisoba, "Withdraw")
            .withArgs(
              this.alice.address,
              this.alice.address,
              this.deployer.address,
              params.seed_deposit.div(10),
              params.seed_deposit.div(10)
            );
        });
      });

      describe("Redeem", function () {
        it("Reverts if the yakisoba is paused", async function () {
          await this.yakisoba.pause();
          expect(await this.yakisoba.paused()).to.equal(true);
          await expect(
            this.yakisoba.redeem(
              params.seed_deposit,
              this.deployer.address,
              this.deployer.address
            )
          ).to.be.revertedWith("Pausable: paused");
        });

        it("Burns the correct amount of shares", async function () {
          expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
            params.seed_deposit
          );

          // We redeem 1e8
          await this.yakisoba.redeem(
            params.seed_deposit,
            this.deployer.address,
            this.deployer.address
          );

          // We should have 0 shares
          expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
            ethers.constants.Zero
          );
        });

        it("Reverts if we redeem 0 shares", async function () {
          await expect(
            this.yakisoba.redeem(0, this.deployer.address, this.deployer.address)
          ).to.be.revertedWithCustomError(this.yakisoba, "AmountZero");
        });

        it("Burns the correct amount of shares with a different share price", async function () {
          // We send 1e8 USDC
          await this.usdc.transfer(this.yakisoba.address, params.seed_deposit);

          // We check that the share price is 2
          expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
            params.seed_deposit
          );
          expect(await this.yakisoba.totalSupply()).to.equal(params.seed_deposit);
          expect(await this.yakisoba.totalAssets()).to.equal(
            params.seed_deposit.mul(2)
          );
          expect(await this.yakisoba.sharePrice()).to.equal(
            ethers.utils.parseUnits("2", this.decimals)
          );

          const balance: BigNumber = await this.usdc.balanceOf(
            this.deployer.address
          );

          // We redeem seed_deposit
          await this.yakisoba.redeem(
            params.seed_deposit,
            this.deployer.address,
            this.deployer.address
          );
          // We should have 0 shares left
          expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
            ethers.constants.Zero
          );
          // We should have 2*seed_deposit USDC
          expect(await this.usdc.balanceOf(this.deployer.address)).to.equal(
            balance.add(params.seed_deposit.mul(2))
          );
        });

        it("Takes redeem fees", async function () {
          expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
            params.seed_deposit
          );

          await this.yakisoba.setFees(0, 0, 50); // 0.5% redeem fee

          const balBefore = await this.usdc.balanceOf(this.deployer.address);

          // We redeem 1e8
          await this.yakisoba.redeem(
            params.seed_deposit,
            this.deployer.address,
            this.deployer.address
          );

          expect(await this.usdc.balanceOf(this.deployer.address)).to.equal(
            balBefore.add(params.seed_deposit.mul(9950).div(10000))
          );
          // We should have 0 shares
          expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(
            ethers.constants.Zero
          );
        });
      });

      describe("SafeReedem", function () {
        it("Reverts if the yakisoba is paused", async function () {
          await this.yakisoba.pause();
          expect(await this.yakisoba.paused()).to.equal(true);
          await expect(
            this.yakisoba.safeRedeem(
              params.seed_deposit,
              params.seed_deposit,
              ethers.constants.MaxUint256,
              this.deployer.address,
              this.deployer.address
            )
          ).to.be.revertedWith("Pausable: paused");
        });

        it("Reverts if minAmount is not reached", async function () {
          await expect(
            this.yakisoba.safeRedeem(
              params.seed_deposit,
              params.seed_deposit.add(1),
              ethers.constants.MaxUint256,
              this.deployer.address,
              this.deployer.address
            )
          )
            .to.be.revertedWithCustomError(this.yakisoba, "IncorrectAssetAmount")
            .withArgs(params.seed_deposit);
        });
      });
      describe("SafeWithdraw", function () {
        it("Reverts if the yakisoba is paused", async function () {
          await this.yakisoba.pause();
          expect(await this.yakisoba.paused()).to.equal(true);
          await expect(
            this.yakisoba.safeWithdraw(
              params.seed_deposit,
              params.seed_deposit,
              ethers.constants.MaxUint256,
              this.deployer.address,
              this.deployer.address
            )
          ).to.be.revertedWith("Pausable: paused");
        });

        it("Reverts if minAmount is not reached", async function () {
          await expect(
            this.yakisoba.safeWithdraw(
              params.seed_deposit,
              params.seed_deposit.add(1),
              ethers.constants.MaxUint256,
              this.deployer.address,
              this.deployer.address
            )
          )
            .to.be.revertedWithCustomError(this.yakisoba, "IncorrectAssetAmount")
            .withArgs(params.seed_deposit);
        });
      });
    });
  });
});
