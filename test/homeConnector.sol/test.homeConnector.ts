const { expect } = require("chai");
import assert from "assert";

import * as fxt from "../utils/fixtures";

import { BigNumber, Contract, ContractFactory } from "ethers";
import { ethers, upgrades, testUtils } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Yakisoba } from "../../typechain-types";

import a from "../utils/mainnet-adresses";
import params from "../utils/params";
import { AbiCoder } from "ethers/lib/utils";
import { IBridgeConnectorHome } from "../../typechain-types/contracts/interfaces/IBridgeConnectorHome";
import { BridgeConnectorHomeSTG } from "../../typechain-types/contracts/cross-chain/BridgeConnectorHomeSTG.sol/BridgeConnectorHomeSTG";

interface ChainData {
  debt: BigNumber;
  maxDeposit: BigNumber;
  bridge: string;
}

const coder: AbiCoder = new ethers.utils.AbiCoder();

describe("test.homeConnector", function () {
  beforeEach(async function () {
    this.deployer = await fxt.getDeployer();
    this.yakisoba = await fxt.deployYakisoba(this.deployer);
    this.usdc = await fxt.getUSDCToken(this.deployer);
    await fxt.getUSDC(this.deployer);
    this.decimals = await this.usdc.decimals();
    this.alice = await fxt.getAlice();

    // We unpause to allow withdraws
    await this.yakisoba.unpause();
    expect(await this.yakisoba.paused()).to.equal(false);
    // We increase maxTotalAssets to allow deposits
    await this.yakisoba.setMaxTotalAssets(ethers.constants.MaxUint256);
    await this.yakisoba.setFees(0, 0, 0);

    // We can save the balances after the initial deposit
    this.balanceEOABefore = await this.usdc.balanceOf(this.deployer.address);
    this.balanceYakisobaBefore = await this.usdc.balanceOf(this.yakisoba.address);

    this.alice = await fxt.getAlice();

    this.chainId = (await ethers.provider.getNetwork()).chainId;
    this.allocator = await fxt.deployHomeAllocator(this.deployer);
    this.home_chain_id = (await ethers.provider.getNetwork()).chainId;
    this.lzHome = await fxt.deployLzHomeMock(this.deployer);
    this.lzRemote = await fxt.deployLzRemoteMock(this.deployer);
    this.stgBridge = await fxt.deployStgMock(this.deployer);
    this.remoteAllocator = await fxt.deployRemoteAllocator(this.deployer);
    this.homeBridgeConnector = await fxt.deployHomeBridge(
      this.deployer,
      this.yakisoba,
      this.lzHome,
      this.stgBridge
    );

    this.remoteBridgeConnector = await fxt.deployRemoteBridgeConnector(
      this.deployer,
      this.homeBridgeConnector,
      this.stgBridge,
      this.lzRemote
    );
  });

  describe("Update yakisoba", function () {
    it("Doesn't update if caller is not owner", async function () {
      await expect(
        this.homeBridgeConnector
          .connect(this.alice)
          .updateYakisoba(this.yakisoba.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    // The rest of this function is tested in /test.crosschain.ts
  });

  describe("sgReceive", function () {
    it("Doesn't receive if caller is not the bridge", async function () {
      await expect(
        this.homeBridgeConnector
          .connect(this.alice)
          .sgReceive(
            0,
            ethers.constants.HashZero,
            0,
            this.usdc.address,
            params.seed_deposit,
            ethers.constants.HashZero
          )
      ).to.be.revertedWithCustomError(
        this.homeBridgeConnector,
        "NotAuthorized"
      );
    });
  });

  describe("BridgeFunds", function () {
    it("Doesn't bridge if caller is not the yakisoba", async function () {
      await expect(
        this.homeBridgeConnector
          .connect(this.alice)
          .bridgeFunds(
            this.usdc.address,
            params.seed_deposit,
            0,
            ethers.constants.HashZero
          )
      ).to.be.revertedWithCustomError(
        this.homeBridgeConnector,
        "NotAuthorized"
      );
    });

    it("Reverts if pool id is 0", async function () {
      const fakeYakisoba = await testUtils.address.impersonate(this.yakisoba.address);
      await this.deployer.sendTransaction({
        to: this.yakisoba.address,
        value: ethers.utils.parseEther("1"),
      });
      expect(
        await this.homeBridgeConnector.dstPoolIdMap(this.home_chain_id + 1)
      ).to.equal(0);
      await expect(
        this.homeBridgeConnector
          .connect(fakeYakisoba)
          .bridgeFunds(
            params.seed_deposit,
            this.home_chain_id + 1,
            0,
            ethers.constants.HashZero
          )
      )
        .to.be.revertedWithCustomError(this.homeBridgeConnector, "PoolNotSet")
        .withArgs(this.home_chain_id + 1);
    });
  });

  describe("ReturnTokens", function () {
    it("Reverts if caller is not the owner", async function () {
      await expect(
        this.homeBridgeConnector.connect(this.alice).returnTokens()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Returns tokens to the owner", async function () {
      const yakisobaBal: BigNumber = await this.usdc.balanceOf(this.yakisoba.address);
      await this.usdc.transfer(
        this.homeBridgeConnector.address,
        params.seed_deposit
      );
      expect(
        await this.usdc.balanceOf(this.homeBridgeConnector.address)
      ).to.equal(params.seed_deposit);
      await expect(this.homeBridgeConnector.returnTokens()).not.to.be.reverted;
      expect(
        await this.usdc.balanceOf(this.homeBridgeConnector.address)
      ).to.equal(0);

      expect(await this.usdc.balanceOf(this.yakisoba.address)).to.equal(
        yakisobaBal.add(params.seed_deposit)
      );
    });
  });

  describe("addChain", function () {
    it("Reverts if caller is not the yakisoba", async function () {
      await expect(
        this.homeBridgeConnector
          .connect(this.alice)
          .addChain(
            this.home_chain_id + 1,
            this.remoteBridgeConnector.address,
            this.remoteAllocator.address,
            ethers.constants.HashZero
          )
      ).to.be.revertedWithCustomError(
        this.homeBridgeConnector,
        "NotAuthorized"
      );
    });
  });

  describe("Receive ether", function () {
    it("Receives Ether smoothly", async function () {
      await expect(
        this.deployer.sendTransaction({
          to: this.homeBridgeConnector.address,
          value: ethers.utils.parseEther("1"),
        })
      ).not.to.be.reverted;
    });

    it("Recovers Ether", async function () {
      await expect(
        this.deployer.sendTransaction({
          to: this.homeBridgeConnector.address,
          value: ethers.utils.parseEther("1"),
        })
      ).not.to.be.reverted;

      expect(
        await ethers.provider.getBalance(this.homeBridgeConnector.address)
      ).to.be.greaterThan(0);
      const balanceBefore = await this.deployer.getBalance();
      await expect(this.homeBridgeConnector.recoverNative()).not.to.be.reverted;
      const balanceAfter = await this.deployer.getBalance();
      expect(balanceAfter).to.be.greaterThan(balanceBefore);
    });

    it("Reverts if caller is not the owner", async function () {
      await expect(
        this.homeBridgeConnector.connect(this.alice).recoverNative()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
