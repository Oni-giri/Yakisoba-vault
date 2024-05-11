const { expect } = require("chai");

import * as fxt from "../utils/fixtures";

import { BigNumber, Contract } from "ethers";
import { ethers, upgrades } from "hardhat";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Yakisoba } from "../../typechain-types/contracts/Yakisoba";
import a from "../utils/mainnet-adresses";
import assert from "assert";
import params from "../utils/params";

describe("Yakisoba deployment", function () {
  beforeEach(async function () {
    this.deployer = await fxt.getDeployer();
    this.alice = await fxt.getAlice();
    this.yakisoba = await fxt.deployYakisoba(this.deployer);
    this.usdc = await fxt.getUSDCToken(this.deployer);
    await fxt.getUSDC(this.deployer);
    this.decimals = await this.usdc.decimals();
  });

  describe("test.yakisoba.init", function () {
    it("Yakisoba ERC20 initialization", async function () {
      expect(await this.yakisoba.owner()).to.equal(this.deployer.address);
      expect(await this.yakisoba.name()).to.equal("Test Yakisoba");
      expect(await this.yakisoba.symbol()).to.equal("CRT");

      expect(await this.yakisoba.totalSupply()).to.equal(ethers.constants.Zero);

      expect(await this.yakisoba.decimals()).to.equal(this.decimals);
      expect(await this.yakisoba.balanceOf(this.deployer.address)).to.equal(0);
    });

    it("Other initializers ", async function () {
      expect(await this.yakisoba.sharePrice()).to.equal(
        ethers.utils.parseUnits("1", 6)
      );
      expect(await this.yakisoba.performanceFee()).to.equal(1000);
      expect(await this.yakisoba.managementFee()).to.equal(100);
      expect(await this.yakisoba.withdrawFee()).to.equal(50);
      expect(await this.yakisoba.asset()).to.equal(a.usdc);
      expect(await this.yakisoba.maxDeposit(this.deployer.address)).to.equal(
        ethers.constants.Zero
      );
      expect(await this.yakisoba.maxMint(this.deployer.address)).to.equal(
        ethers.constants.Zero
      );
      expect(await this.yakisoba.maxTotalAssets()).to.equal(ethers.constants.Zero);
      expect(await this.yakisoba.paused()).to.equal(true);
    });

    it("Reverts if fees are too high", async function () {
      const Yakisoba = await ethers.getContractFactory("Yakisoba");
      await expect(
        Yakisoba.deploy(
          a.usdc,
          params.yakisoba_name,
          params.yakisoba_symbol,
          20000,
          0,
          0,
          {
            gasLimit: 30000000, // Maw gas limit
          }
        )
      ).to.be.revertedWithCustomError(Yakisoba, "FeeError");

      await expect(
        Yakisoba.deploy(
          a.usdc,
          params.yakisoba_name,
          params.yakisoba_symbol,
          0,
          20000,
          0,
          {
            gasLimit: 30000000, // Maw gas limit
          }
        )
      ).to.be.revertedWithCustomError(Yakisoba, "FeeError");

      await expect(
        Yakisoba.deploy(
          a.usdc,
          params.yakisoba_name,
          params.yakisoba_symbol,
          0,
          0,
          20000,
          {
            gasLimit: 30000000, // Maw gas limit
          }
        )
      ).to.be.revertedWithCustomError(Yakisoba, "FeeError");
    });
  });

  describe("Pausable", function () {
    it("Pause", async function () {
      expect(await this.yakisoba.paused()).to.equal(true);
      expect(await this.yakisoba.maxTotalAssets()).to.equal(ethers.constants.Zero);
      await this.yakisoba.unpause();
      expect(await this.yakisoba.paused()).to.equal(false);

      // Pause should reset maxTotalAssets to 0
      await this.yakisoba.setMaxTotalAssets(ethers.constants.MaxInt256);
      await this.yakisoba.pause();
      expect(await this.yakisoba.paused()).to.equal(true);
      expect(await this.yakisoba.maxTotalAssets()).to.equal(ethers.constants.Zero);
      expect(await this.yakisoba.maxDeposit(this.deployer.address)).to.equal(
        ethers.constants.Zero
      );

      // We can't deposit
      await expect(
        this.yakisoba.deposit(params.seed_deposit, this.deployer.address)
      )
        .to.be.revertedWithCustomError(this.yakisoba, "AmountTooHigh")
        .withArgs(0);
      await expect(
        this.yakisoba.withdraw(
          params.seed_deposit,
          this.deployer.address,
          this.deployer.address
        )
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Unpause", async function () {
      expect(await this.yakisoba.paused()).to.equal(true);
      expect(await this.yakisoba.totalSupply()).to.equal(ethers.constants.Zero);
      expect(await this.yakisoba.maxTotalAssets()).to.equal(ethers.constants.Zero);
      expect(await this.yakisoba.unpause())
        .to.emit(this.yakisoba, "Unpaused")
        .withArgs(this.deployer.address);

      // Unpause should deposit 1e8 the first time
      expect(await this.yakisoba.paused()).to.equal(false);
    });

    it("Prevents non-owner from pausing", async function () {
      await expect(this.yakisoba.connect(this.alice).pause()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Prevents non-owner from unpausing", async function () {
      await expect(this.yakisoba.connect(this.alice).unpause()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Sets maxTotalAssets", async function () {
      expect(await this.yakisoba.paused()).to.equal(true);
      expect(await this.yakisoba.maxTotalAssets()).to.equal(ethers.constants.Zero);

      // Should revert if not paused && totalSupply  == 0
      await expect(this.yakisoba.setMaxTotalAssets(ethers.constants.MaxInt256)).to
        .be.reverted;

      await this.yakisoba.unpause();
      expect(await this.yakisoba.paused()).to.equal(false);
      expect(await this.yakisoba.totalSupply()).to.equal(ethers.constants.Zero);
      await expect(this.yakisoba.setMaxTotalAssets(ethers.constants.MaxInt256)).not
        .to.be.reverted;
      expect(await this.yakisoba.maxTotalAssets()).to.equal(
        ethers.constants.MaxInt256
      );
    });

    it("Emits a MaxTotalAssetsSet event", async function () {
      await this.yakisoba.unpause();
      expect(await this.yakisoba.paused()).to.equal(false);
      expect(await this.yakisoba.totalSupply()).to.equal(ethers.constants.Zero);

      await expect(this.yakisoba.setMaxTotalAssets(ethers.constants.MaxInt256))
        .to.emit(this.yakisoba, "MaxTotalAssetsSet")
        .withArgs(ethers.constants.MaxInt256);
    });

    it("Prevents non-owner from setting maxTotalAssets", async function () {
      await expect(
        this.yakisoba
          .connect(this.alice)
          .setMaxTotalAssets(ethers.constants.MaxInt256)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
