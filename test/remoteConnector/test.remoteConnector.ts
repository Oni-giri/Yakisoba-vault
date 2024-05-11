const { expect } = require("chai");
import assert from "assert";

import * as fxt from "../utils/fixtures";

import { BigNumber, Contract, ContractFactory } from "ethers";
import { ethers, upgrades, testUtils } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Yakisoba } from "../../typechain-types";
import { MockForceSender } from "../../typechain-types";

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

describe("test.remoteConnector", function () {
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
      this.stgBridge,
      this.lzHome
    );

    expect(await this.homeBridgeConnector.stgEndpoint()).to.equal(
      this.stgBridge.address
    );

    this.remoteBridgeConnector = await fxt.deployRemoteBridgeConnector(
      this.deployer,
      this.homeBridgeConnector,
      this.stgBridge,
      this.lzRemote
    );
  });

  describe("BridgeFunds", function () {
    it("Bridges funds back correctly", async function () {
      const bytesParams: string = await coder.encode(
        ["uint256", "uint16"],
        [
          params.lz_remote_chain_id,
          ethers.BigNumber.from(params.dstPoolId.toString()),
        ]
      );

      await expect(
        this.yakisoba.addChain(
          this.home_chain_id + 1,
          ethers.constants.MaxUint256,
          this.homeBridgeConnector.address,
          this.remoteAllocator.address,
          this.remoteBridgeConnector.address,
          bytesParams
        )
      ).not.to.be.reverted;

      const balYakisobaBefore = await this.usdc.balanceOf(this.yakisoba.address);
      const balRemoteBefore = await this.usdc.balanceOf(
        this.remoteBridgeConnector.address
      );
      const balHomeBefore = await this.usdc.balanceOf(
        this.homeBridgeConnector.address
      );
      await this.remoteAllocator.setBridge(this.remoteBridgeConnector.address);
      await this.remoteBridgeConnector.setAllocator(
        this.remoteAllocator.address
      );

      await this.usdc.transfer(
        this.remoteAllocator.address,
        params.seed_deposit
      );

      const gasCost2: BigNumber =
        await this.remoteBridgeConnector.estimateBridgeCost();

      await expect(
        this.remoteAllocator.bridgeBackFunds(
          params.seed_deposit,
          params.seed_deposit.mul(98).div(100),
          {
            value: gasCost2,
          }
        )
      ).not.to.be.reverted;

      expect(await this.usdc.balanceOf(this.yakisoba.address)).to.equal(
        balYakisobaBefore.add(params.seed_deposit.mul(998).div(1000))
      );
    });

    it("Reverts if slippage is too high", async function () {
      const bytesParams: string = await coder.encode(
        ["uint256", "uint16"],
        [
          params.lz_remote_chain_id,
          ethers.BigNumber.from(params.dstPoolId.toString()),
        ]
      );

      await expect(
        this.yakisoba.addChain(
          this.home_chain_id + 1,
          ethers.constants.MaxUint256,
          this.homeBridgeConnector.address,
          this.remoteAllocator.address,
          this.remoteBridgeConnector.address,
          bytesParams
        )
      ).not.to.be.reverted;

      const balYakisobaBefore = await this.usdc.balanceOf(this.yakisoba.address);
      const balRemoteBefore = await this.usdc.balanceOf(
        this.remoteBridgeConnector.address
      );
      const balHomeBefore = await this.usdc.balanceOf(
        this.homeBridgeConnector.address
      );
      await this.remoteAllocator.setBridge(this.remoteBridgeConnector.address);
      await this.remoteBridgeConnector.setAllocator(
        this.remoteAllocator.address
      );

      await this.usdc.transfer(
        this.remoteAllocator.address,
        params.seed_deposit
      );

      const gasCost2: BigNumber =
        await this.remoteBridgeConnector.estimateBridgeCost();

      await expect(
        this.remoteAllocator.bridgeBackFunds(
          params.seed_deposit,
          params.seed_deposit.mul(98).div(100),
          {
            value: gasCost2,
          }
        )
      ).not.to.be.reverted;
    });
    it("Reverts if not called by the Allocator", async function () {
      await expect(
        this.remoteBridgeConnector
          .connect(this.alice)
          .bridgeFunds(
            params.seed_deposit,
            params.seed_deposit.mul(98).div(100)
          )
      ).to.be.revertedWithCustomError(
        this.remoteBridgeConnector,
        "NotAuthorized"
      );
    });
  });

  describe("Update chain debt", function () {
    it("Reverts if not called by the Allocator", async function () {
      await expect(
        this.remoteBridgeConnector
          .connect(this.alice)
          .updateChainDebt(this.home_chain_id, params.seed_deposit)
      ).to.be.revertedWithCustomError(
        this.remoteBridgeConnector,
        "NotAuthorized"
      );
    });
  });

  describe("EstimateUpdateCost", async function () {
    it("Returns the correct cost", async function () {
      await expect(await this.remoteBridgeConnector.estimateUpdateCost()).not.to
        .be.reverted;
      const cost: BigNumber =
        await this.remoteBridgeConnector.estimateUpdateCost();
      expect(cost).to.be.greaterThan(0);
    });
  });

  describe("RecoverNative", async function () {
    it("Reverts if not called by the Owner", async function () {
      await expect(
        this.remoteBridgeConnector.connect(this.alice).recoverNative()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Recovers native funds", async function () {
      const ForceSenderFactory = await ethers.getContractFactory(
        "MockForceSender",
        this.deployer
      );

      const forceSender: MockForceSender =
        (await ForceSenderFactory.deploy()) as MockForceSender;
      await forceSender.deployed();
      await this.deployer.sendTransaction({
        to: forceSender.address,
        value: ethers.utils.parseEther("1"),
      });

      await forceSender.forceSend(this.remoteBridgeConnector.address);
      expect(
        await ethers.provider.getBalance(this.remoteBridgeConnector.address)
      ).to.be.equal(ethers.utils.parseEther("1"));

      const balBefore: BigNumber = await ethers.provider.getBalance(
        this.deployer.address
      );
      await expect(this.remoteBridgeConnector.recoverNative()).not.to.be
        .reverted;

      expect(
        await ethers.provider.getBalance(this.remoteBridgeConnector.address)
      ).to.equal(0);
      expect(
        await ethers.provider.getBalance(this.deployer.address)
      ).to.be.greaterThan(balBefore);
    });
  });

  describe("SetUpdateGasCost", async function () {
    it("Set update gas costs", async function () {
      await expect(this.remoteBridgeConnector.setUpdateGasCost(100)).not.to.be
        .reverted;
      expect(await this.remoteBridgeConnector.updateGasAmount()).to.equal(100);
    });

    it("Reverts if not called by the Owner", async function () {
      await expect(
        this.remoteBridgeConnector.connect(this.alice).setUpdateGasCost(100)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("SetAllocator", async function () {
    it("Sets the allocator", async function () {
      await expect(
        this.remoteBridgeConnector.setAllocator(this.deployer.address)
      ).not.to.be.reverted;
      expect(await this.remoteBridgeConnector.allocator()).to.equal(
        this.deployer.address
      );
    });

    it("Reverts if the allocator is already set", async function () {
      await expect(
        this.remoteBridgeConnector.setAllocator(this.deployer.address)
      ).not.to.be.reverted;
      expect(await this.remoteBridgeConnector.allocator()).to.equal(
        this.deployer.address
      );

      await expect(
        this.remoteBridgeConnector.setAllocator(this.deployer.address)
      ).to.be.revertedWithCustomError(
        this.remoteBridgeConnector,
        "AllocatorAlreadySet"
      );
    });

    it("Reverts if not called by the Owner", async function () {
      await expect(
        this.remoteBridgeConnector
          .connect(this.alice)
          .setAllocator(this.deployer.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
