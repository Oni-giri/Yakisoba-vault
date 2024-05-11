const { expect } = require("chai");
import assert from "assert";

import * as fxt from "../utils/fixtures";

import { BigNumber, Contract, ContractFactory } from "ethers";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
const { PANIC_CODES } = require("@nomicfoundation/hardhat-chai-matchers/panic");

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

describe("test.yakisoba.crosschain", function () {
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

    // No need for swap as we'll test cross chain funcs
  });

  describe("Manages chain", function () {
    beforeEach(async function () {
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

    it("Add local chain", async function () {
      await expect(
        this.yakisoba.addChain(
          this.home_chain_id,
          ethers.constants.MaxUint256,
          this.allocator.address,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.HashZero
        )
      ).not.to.be.reverted;

      const chainList: BigNumber = await this.yakisoba.chainList(0);
      expect(chainList).to.equal(this.home_chain_id);

      const chainData: ChainData = (await this.yakisoba.chainData(
        this.home_chain_id
      )) as ChainData;

      expect(chainData["debt"]).to.equal(0);
      expect(chainData["maxDeposit"]).to.equal(ethers.constants.MaxUint256);
      expect(chainData["bridge"]).to.equal(this.allocator.address);
      expect(await this.yakisoba.bridgeWhitelist(this.allocator.address)).to.equal(
        true
      );
    });

    it("Add remote chain", async function () {
      // We compute the parameters for the remote chain
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
      const chainData: ChainData = (await this.yakisoba.chainData(
        this.home_chain_id + 1
      )) as ChainData;
      expect(chainData["debt"]).to.equal(0);

      expect(chainData["maxDeposit"]).to.equal(ethers.constants.MaxUint256);
      expect(chainData["bridge"]).to.equal(this.homeBridgeConnector.address);
      expect(
        await this.yakisoba.bridgeWhitelist(this.homeBridgeConnector.address)
      ).to.equal(true);

      expect(
        await this.homeBridgeConnector.lzChainIdMap(this.home_chain_id + 1)
      ).to.equal(params.lz_remote_chain_id);
      expect(
        await this.homeBridgeConnector.convertLzChainId(
          params.lz_remote_chain_id
        )
      ).to.equal(this.home_chain_id + 1);
      expect(
        await this.homeBridgeConnector.dstPoolIdMap(this.home_chain_id + 1)
      ).to.equal(params.dstPoolId);
      expect(
        await this.homeBridgeConnector.allocatorsMap(this.home_chain_id + 1)
      ).to.equal(this.remoteAllocator.address);
    });

    it("Add chains that already exist", async function () {
      // We compute the parameters for the remote chain
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
      const chainData: ChainData = (await this.yakisoba.chainData(
        this.home_chain_id + 1
      )) as ChainData;
      expect(chainData["debt"]).to.equal(0);

      expect(chainData["maxDeposit"]).to.equal(ethers.constants.MaxUint256);
      expect(chainData["bridge"]).to.equal(this.homeBridgeConnector.address);
      expect(
        await this.yakisoba.bridgeWhitelist(this.homeBridgeConnector.address)
      ).to.equal(true);

      expect(
        await this.homeBridgeConnector.lzChainIdMap(this.home_chain_id + 1)
      ).to.equal(params.lz_remote_chain_id);
      expect(
        await this.homeBridgeConnector.convertLzChainId(
          params.lz_remote_chain_id
        )
      ).to.equal(this.home_chain_id + 1);
      expect(
        await this.homeBridgeConnector.dstPoolIdMap(this.home_chain_id + 1)
      ).to.equal(params.dstPoolId);
      expect(
        await this.homeBridgeConnector.allocatorsMap(this.home_chain_id + 1)
      ).to.equal(this.remoteAllocator.address);

      // We add again the chain with a different allocator
      await expect(
        this.yakisoba.addChain(
          this.home_chain_id + 1,
          ethers.constants.MaxUint256,
          this.homeBridgeConnector.address,
          this.alice.address, // We use alice address as allocator
          this.remoteBridgeConnector.address,
          bytesParams
        )
      ).not.to.be.reverted;

      expect(
        await this.homeBridgeConnector.allocatorsMap(this.home_chain_id + 1)
      ).to.equal(this.alice.address);
    });

    it("Emits chainAdded event", async function () {
      await expect(
        this.yakisoba.addChain(
          this.home_chain_id,
          ethers.constants.MaxUint256,
          this.allocator.address,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.HashZero
        )
      )
        .to.emit(this.yakisoba, "ChainAdded")
        .withArgs(this.home_chain_id, this.allocator.address);
    });

    it("Reverts if the chain adder is not the owner", async function () {
      await expect(
        this.yakisoba.connect(this.alice).addChain(
          this.home_chain_id,

          ethers.constants.MaxUint256,
          this.allocator.address,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.HashZero
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Set MaxDeposit for chain", async function () {
      await expect(
        this.yakisoba.addChain(
          this.home_chain_id,
          ethers.constants.MaxUint256,
          this.allocator.address,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.HashZero
        )
      ).not.to.be.reverted;

      await expect(
        this.yakisoba.setMaxDepositForChain(
          params.seed_deposit,
          this.home_chain_id
        )
      ).not.to.be.reverted;

      const chainData: ChainData = (await this.yakisoba.chainData(
        this.home_chain_id
      )) as ChainData;
      expect(chainData["maxDeposit"]).to.equal(params.seed_deposit);
    });

    it("Reverts if the caller is not the owner", async function () {
      await expect(
        this.yakisoba
          .connect(this.alice)
          .setMaxDepositForChain(params.seed_deposit, this.home_chain_id)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Reverts if the chain does not exist", async function () {
      await expect(
        this.yakisoba.setMaxDepositForChain(
          params.seed_deposit,
          this.home_chain_id
        )
      ).to.be.revertedWithCustomError(this.yakisoba, "ChainError");
    });

    it("Set MaxDeposit for chain emits event", async function () {
      await expect(
        this.yakisoba.addChain(
          this.home_chain_id,
          ethers.constants.MaxUint256,
          this.allocator.address,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.HashZero
        )
      ).not.to.be.reverted;

      await expect(
        this.yakisoba.setMaxDepositForChain(
          params.seed_deposit,
          this.home_chain_id
        )
      )
        .to.emit(this.yakisoba, "MaxDepositForChainSet")
        .withArgs(params.seed_deposit, this.home_chain_id);
    });
  });

  describe("Updates chain debt", function () {
    beforeEach(async function () {
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
        this.lzRemote,
        this.stgBridge
      );
    });

    it("Updates debt", async function () {
      await expect(
        this.yakisoba.addChain(
          this.home_chain_id,
          ethers.constants.MaxUint256,
          this.deployer.address,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.HashZero
        )
      ).not.to.be.reverted;
      const sharePrice: BigNumber = await this.yakisoba.sharePrice();
      expect(await this.yakisoba.totalRemoteAssets()).to.be.equal(
        ethers.constants.Zero
      );

      // We update chain debt
      await expect(
        this.yakisoba.updateChainDebt(this.home_chain_id, params.seed_deposit)
      ).not.to.be.reverted;

      const chainData: ChainData = (await this.yakisoba.chainData(
        this.home_chain_id
      )) as ChainData;

      expect(chainData["debt"]).to.equal(params.seed_deposit);
      const anticipatedProfits: BigNumber =
        await this.yakisoba.anticipatedProfits();
      const lastUpdate: BigNumber = await this.yakisoba.lastUpdate();
      expect(anticipatedProfits).to.equal(params.seed_deposit);
      expect(lastUpdate).to.equal(
        (await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))
          .timestamp
      );

      // Share price should not change
      expect(await this.yakisoba.sharePrice()).to.equal(sharePrice);
      expect(await this.yakisoba.totalRemoteAssets()).to.equal(
        params.seed_deposit
      );

      // Share price should increase over two days
      await time.increase(86400);
      const sharePrice2: BigNumber = await this.yakisoba.sharePrice();
      expect(await this.yakisoba.sharePrice()).to.be.greaterThan(sharePrice);
      await time.increase(86400);
      const sharePrice3: BigNumber = await this.yakisoba.sharePrice();
      expect(await this.yakisoba.sharePrice()).to.be.greaterThan(sharePrice2);
      await time.increase(86400);
      // After two days share price should be the same
      expect(await this.yakisoba.sharePrice()).to.be.equal(sharePrice3);
    });

    it("Updates debt emits event", async function () {
      await expect(
        this.yakisoba.addChain(
          this.home_chain_id,
          ethers.constants.MaxUint256,
          this.deployer.address,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.HashZero
        )
      ).not.to.be.reverted;

      await expect(
        this.yakisoba.updateChainDebt(this.home_chain_id, params.seed_deposit)
      )
        .to.emit(this.yakisoba, "ChainDebtUpdated")
        .withArgs(
          params.seed_deposit,
          ethers.constants.Zero,
          this.home_chain_id
        );

      await expect(
        this.yakisoba.updateChainDebt(this.home_chain_id, params.seed_deposit)
      ).to.emit(this.yakisoba, "SharePriceUpdated");
    });

    it("Adds unrealized gains to the chain debt delta", async function () {
      await expect(
        this.yakisoba.addChain(
          this.home_chain_id,
          ethers.constants.MaxUint256,
          this.deployer.address,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.HashZero
        )
      ).not.to.be.reverted;

      var totalAssets: BigNumber = await this.yakisoba.totalAssets();
      await expect(
        this.yakisoba.updateChainDebt(this.home_chain_id, params.seed_deposit)
      ).not.to.be.reverted;

      const chainData: ChainData = (await this.yakisoba.chainData(
        this.home_chain_id
      )) as ChainData;

      expect(chainData["debt"]).to.equal(params.seed_deposit);
      const anticipatedProfits: BigNumber =
        await this.yakisoba.anticipatedProfits();
      const lastUpdate: BigNumber = await this.yakisoba.lastUpdate();
      expect(anticipatedProfits).to.equal(params.seed_deposit);
      expect(lastUpdate).to.equal(
        (await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))
          .timestamp
      );
      const unGains: BigNumber = await this.yakisoba.unrealizedGains();
      expect(unGains).to.equal(params.seed_deposit);

      // We update chain debt again after a day
      await time.increase(86400);
      expect(await this.yakisoba.unrealizedGains()).to.equal(
        params.seed_deposit.div(2)
      );
      expect(await this.yakisoba.totalAssets()).to.be.lessThan(
        totalAssets.add(params.seed_deposit)
      );
      await expect(
        this.yakisoba.updateChainDebt(
          this.home_chain_id,
          params.seed_deposit.mul(2)
        )
      ).not.to.be.reverted;

      const chainData2: ChainData = (await this.yakisoba.chainData(
        this.home_chain_id
      )) as ChainData;

      const anticipatedProfits2: BigNumber =
        await this.yakisoba.anticipatedProfits();
      const lastUpdate2: BigNumber = await this.yakisoba.lastUpdate();
      expect(anticipatedProfits2).to.be.within(
        params.seed_deposit.add(params.seed_deposit.div(2)).sub(1000),
        params.seed_deposit.add(params.seed_deposit.div(2))
      );
      expect(lastUpdate2).to.equal(
        (await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))
          .timestamp
      );
    });

    it("Reduces the total Assets if we have a loss", async function () {
      await expect(
        this.yakisoba.addChain(
          this.home_chain_id,
          ethers.constants.MaxUint256,
          this.deployer.address,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.HashZero
        )
      ).not.to.be.reverted;

      var totalAssets: BigNumber = await this.yakisoba.totalAssets();
      await expect(
        this.yakisoba.updateChainDebt(this.home_chain_id, params.seed_deposit)
      ).not.to.be.reverted;

      const chainData: ChainData = (await this.yakisoba.chainData(
        this.home_chain_id
      )) as ChainData;

      expect(chainData["debt"]).to.equal(params.seed_deposit);
      const anticipatedProfits: BigNumber =
        await this.yakisoba.anticipatedProfits();
      const lastUpdate: BigNumber = await this.yakisoba.lastUpdate();
      expect(anticipatedProfits).to.equal(params.seed_deposit);
      expect(lastUpdate).to.equal(
        (await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))
          .timestamp
      );

      const unGains: BigNumber = await this.yakisoba.unrealizedGains();
      expect(unGains).to.equal(params.seed_deposit);

      // We update chain debt again after a day
      await time.increase(86400);
      expect(await this.yakisoba.unrealizedGains()).to.equal(
        params.seed_deposit.div(2)
      );
      expect(await this.yakisoba.totalAssets()).to.be.lessThan(
        totalAssets.add(params.seed_deposit)
      );
      const totalAssets2: BigNumber = await this.yakisoba.totalAssets();
      await expect(
        this.yakisoba.updateChainDebt(
          this.home_chain_id,
          params.seed_deposit.div(2)
        )
      ).not.to.be.reverted;

      const chainData2: ChainData = (await this.yakisoba.chainData(
        this.home_chain_id
      )) as ChainData;

      expect(anticipatedProfits).to.be.equal(
        await this.yakisoba.anticipatedProfits()
      );

      expect(chainData2["debt"]).to.be.equal(params.seed_deposit.div(2));
      expect(await this.yakisoba.totalAssets()).to.be.within(
        totalAssets2.sub(params.seed_deposit.div(2)),
        totalAssets2.sub(params.seed_deposit.div(2)).add(1000)
      );
    });

    it("Only allows the bridge to update the chain debt", async function () {
      await expect(
        this.yakisoba.addChain(
          this.home_chain_id,
          ethers.constants.MaxUint256,
          this.deployer.address,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.HashZero
        )
      ).not.to.be.reverted;

      await expect(
        this.yakisoba
          .connect(await fxt.getAlice())
          .updateChainDebt(this.home_chain_id, params.seed_deposit)
      ).to.be.revertedWithCustomError(this.yakisoba, "Unauthorized");
    });
  });

  describe("Value transfer between chains", function () {
    beforeEach(async function () {
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
      this.remoteBridgeConnector = await fxt.deployRemoteBridgeConnector(
        this.deployer,
        this.homeBridgeConnector,
        this.stgBridge,
        this.lzRemote
      );

      this.remoteAllocator.setBridge(this.remoteBridgeConnector.address);
      this.remoteBridgeConnector.setAllocator(this.remoteAllocator.address);

      await fxt.setupLzMocks(
        this.deployer,
        this.lzHome,
        this.lzRemote,
        this.homeBridgeConnector,
        this.remoteBridgeConnector
      );
    });

    it("Estimage bridge costs", async function () {
      await expect(
        this.yakisoba.addChain(
          this.home_chain_id,
          ethers.constants.MaxUint256,
          this.deployer.address,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.HashZero
        )
      ).not.to.be.reverted;

      const gasCosts: BigNumber[] = await this.yakisoba.estimateDispatchCost(
        [this.home_chain_id],
        [params.seed_deposit]
      );

      expect(gasCosts[0]).to.be.equal(ethers.constants.Zero);

      // Add remote chain
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

      const remoteChainId: BigNumber = this.home_chain_id + 1;
      const chainIds: BigNumber[] = [this.home_chain_id, remoteChainId];
      const amounts: BigNumber[] = [params.seed_deposit, params.seed_deposit];
      const gasCosts2 = await this.yakisoba.estimateDispatchCost(
        chainIds,
        amounts
      );

      expect(gasCosts2[0]).to.be.equal(ethers.constants.Zero);
      expect(gasCosts2[1]).to.be.greaterThan(ethers.constants.Zero);
    });

    it("Reverts if array lengths don't match for estimation", async function () {
      await expect(
        this.yakisoba.addChain(
          this.home_chain_id,
          ethers.constants.MaxUint256,
          this.deployer.address,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.HashZero
        )
      ).not.to.be.reverted;

      const gasCosts: BigNumber[] = await this.yakisoba.estimateDispatchCost(
        [this.home_chain_id],
        [params.seed_deposit]
      );

      expect(gasCosts[0]).to.be.equal(ethers.constants.Zero);

      // Add remote chain
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

      const remoteChainId: BigNumber = this.home_chain_id + 1;
      const chainIds: BigNumber[] = [this.home_chain_id, remoteChainId];
      const amounts: BigNumber[] = [params.seed_deposit];
      await expect(this.yakisoba.estimateDispatchCost(chainIds, amounts)).to.be
        .reverted;
    });

    it("Dispatches assets to chains", async function () {
      await expect(
        this.yakisoba.addChain(
          this.home_chain_id,
          ethers.constants.MaxUint256,
          this.allocator.address,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.HashZero
        )
      ).not.to.be.reverted;

      // Add remote chain
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

      await expect(
        this.yakisoba.deposit(params.seed_deposit.mul(10), this.deployer.address)
      ).not.to.be.reverted;

      const balBefore: BigNumber = await this.yakisoba.totalAssets();
      const balUsdcBefore: BigNumber = await this.usdc.balanceOf(
        this.yakisoba.address
      );
      const balUsdcAllocatorBefore: BigNumber = await this.usdc.balanceOf(
        this.allocator.address
      );
      const localChainDebtBefore: BigNumber = (
        await this.yakisoba.chainData(this.home_chain_id)
      )["debt"];

      const gasCost: BigNumber[] = await this.yakisoba.estimateDispatchCost(
        [this.home_chain_id, this.home_chain_id + 1],
        [params.seed_deposit, params.seed_deposit]
      );

      // Try with one deposit on local
      await expect(
        await this.yakisoba.dispatchAssets(
          [params.seed_deposit],
          [params.seed_deposit],
          [this.home_chain_id],
          [gasCost[0]],
          [ethers.constants.HashZero]
        )
      ).not.to.be.reverted;

      expect(await this.usdc.balanceOf(this.allocator.address)).to.be.equal(
        balUsdcAllocatorBefore.add(params.seed_deposit)
      );

      // Try with two deposits

      const options: any = { value: gasCost[1] };
      await expect(
        await this.yakisoba.dispatchAssets(
          [params.seed_deposit, params.seed_deposit],
          [params.seed_deposit, params.seed_deposit.mul(98).div(100)],
          [this.home_chain_id, this.home_chain_id + 1],
          gasCost,
          [ethers.constants.HashZero, ethers.constants.HashZero],
          options
        )
      ).not.to.be.reverted;
      // we check that the fees are within 2% of the expected amount
      expect(
        await this.usdc.balanceOf(this.remoteAllocator.address)
      ).to.be.within(
        balUsdcAllocatorBefore.add(params.seed_deposit).mul(98).div(100),
        balUsdcAllocatorBefore.add(params.seed_deposit)
      );

      const chainData: any = await this.yakisoba.chainData(this.home_chain_id + 1);
      expect(chainData["debt"]).to.be.equal(
        localChainDebtBefore.add(params.seed_deposit)
      );

      // Reverts if we dispatch to non-existent chain
      await expect(
        this.yakisoba.dispatchAssets(
          [params.seed_deposit],
          [params.seed_deposit],
          [this.home_chain_id + 2],
          [gasCost[0]],
          [ethers.constants.HashZero]
        )
      ).to.be.revertedWithCustomError(this.yakisoba, "ChainError");

      // Reverts if the caller is not the owner
      await expect(
        this.yakisoba
          .connect(this.alice)
          .dispatchAssets(
            [params.seed_deposit],
            [params.seed_deposit],
            [this.home_chain_id],
            [gasCost[0]],
            [ethers.constants.HashZero]
          )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Reverts if there some of the ether sent is not used", async function () {
      // Add remote chain
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

      const gasCost: BigNumber[] = await this.yakisoba.estimateDispatchCost(
        [this.home_chain_id, this.home_chain_id + 1],
        [params.seed_deposit, params.seed_deposit]
      );

      // Try with one deposit on local
      await expect(
        this.yakisoba.dispatchAssets(
          [params.seed_deposit],
          [params.seed_deposit.mul(98).div(100)],
          [this.home_chain_id + 1],
          [gasCost[1]],
          [ethers.constants.HashZero],
          {
            value: gasCost[1].add(ethers.utils.parseEther("0.1")),
          }
        )
      )
        .to.be.revertedWithCustomError(this.yakisoba, "ExtraFunds")
        .withArgs(ethers.utils.parseEther("0.1"));
    });

    it("Reverts if we didn't send enough ether along with the call", async function () {
      // Add remote chain
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

      const gasCost: BigNumber[] = await this.yakisoba.estimateDispatchCost(
        [this.home_chain_id, this.home_chain_id + 1],
        [params.seed_deposit, params.seed_deposit]
      );

      // Try with one deposit on local
      await expect(
        this.yakisoba.dispatchAssets(
          [params.seed_deposit],
          [params.seed_deposit.mul(98).div(100)],
          [this.home_chain_id + 1],
          [gasCost[1]],
          [ethers.constants.HashZero]
        )
      ).to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("Reverts if the length of the arrays is not the same", async function () {
      await expect(
        this.yakisoba.dispatchAssets(
          [params.seed_deposit],
          [params.seed_deposit, params.seed_deposit],
          [this.home_chain_id],
          [ethers.constants.Zero],
          [ethers.constants.HashZero]
        )
      ).to.be.revertedWithCustomError(this.allocator, "IncorrectArrayLengths");

      await expect(
        this.yakisoba.dispatchAssets(
          [params.seed_deposit],
          [params.seed_deposit],
          [this.home_chain_id, this.home_chain_id + 1],
          [ethers.constants.Zero],
          [ethers.constants.HashZero]
        )
      ).to.be.revertedWithCustomError(this.allocator, "IncorrectArrayLengths");

      await expect(
        this.yakisoba.dispatchAssets(
          [params.seed_deposit],
          [params.seed_deposit],
          [this.home_chain_id],
          [ethers.constants.Zero, ethers.constants.Zero],
          [ethers.constants.HashZero]
        )
      ).to.be.revertedWithCustomError(this.allocator, "IncorrectArrayLengths");

      await expect(
        this.yakisoba.dispatchAssets(
          [params.seed_deposit],
          [params.seed_deposit],
          [this.home_chain_id],
          [ethers.constants.Zero],
          [ethers.constants.HashZero, ethers.constants.HashZero]
        )
      ).to.be.revertedWithCustomError(this.allocator, "IncorrectArrayLengths");
    });

    it("Emits BridgeSuccess event", async function () {
      // Add remote chain
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

      const gasCost: BigNumber[] = await this.yakisoba.estimateDispatchCost(
        [this.home_chain_id, this.home_chain_id + 1],
        [params.seed_deposit, params.seed_deposit]
      );

      const options: any = { value: gasCost[1] };
      await expect(
        await this.yakisoba.dispatchAssets(
          [params.seed_deposit],
          [params.seed_deposit.mul(98).div(100)],
          [this.home_chain_id + 1],
          [gasCost[1]],
          [ethers.constants.HashZero],
          options
        )
      ).to.emit(this.homeBridgeConnector, "BridgeSuccess");
    });

    it("Reverts if amount is too high", async function () {
      // Add remote chain
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
          params.seed_deposit,
          this.homeBridgeConnector.address,
          this.remoteAllocator.address,
          this.remoteBridgeConnector.address,
          bytesParams
        )
      ).not.to.be.reverted;

      const gasCost: BigNumber[] = await this.yakisoba.estimateDispatchCost(
        [this.home_chain_id, this.home_chain_id + 1],
        [params.seed_deposit, params.seed_deposit]
      );

      const options: any = { value: gasCost[1] };
      await expect(
        this.yakisoba.dispatchAssets(
          [params.seed_deposit.mul(2)],
          [params.seed_deposit.mul(2).mul(98).div(100)],
          [this.home_chain_id + 1],
          [gasCost[1]],
          [ethers.constants.HashZero],
          options
        )
      )
        .to.be.revertedWithCustomError(this.yakisoba, "AmountTooHigh")
        .withArgs(params.seed_deposit);
    });

    it("Receives Bridged Funds", async function () {
      // Add remote chain
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

      const gasCost: BigNumber[] = await this.yakisoba.estimateDispatchCost(
        [this.home_chain_id, this.home_chain_id + 1],
        [params.seed_deposit, params.seed_deposit]
      );

      const options: any = { value: gasCost[1] };
      await expect(
        await this.yakisoba.dispatchAssets(
          [params.seed_deposit],
          [params.seed_deposit.mul(98).div(100)],
          [this.home_chain_id + 1],
          [gasCost[1]],
          [ethers.constants.HashZero],
          options
        )
      ).not.to.be.reverted;

      const gasCost2: BigNumber =
        await this.remoteBridgeConnector.estimateBridgeCost();

      const balYakisobaBeforeBridge: BigNumber = await this.usdc.balanceOf(
        this.yakisoba.address
      );

      const chainData3 = await this.yakisoba.chainData(this.home_chain_id + 1);
      const debtBefore = chainData3["debt"];

      await expect(
        this.remoteAllocator.bridgeBackFunds(params.seed_deposit.div(10), 0, {
          value: gasCost2,
        })
      ).not.to.be.reverted;

      expect(await this.usdc.balanceOf(this.yakisoba.address)).to.be.equal(
        balYakisobaBeforeBridge.add(params.seed_deposit.div(10).mul(998).div(1000))
      );

      const chainData4 = await this.yakisoba.chainData(this.home_chain_id + 1);
      const debtAfter = chainData4["debt"];
      expect(await debtAfter).to.be.equal(
        debtBefore.sub(params.seed_deposit.div(10).mul(998).div(1000))
      );

      // We check that the yakisoba refuses calls from something other than the bridge
      await expect(
        this.yakisoba
          .connect(this.alice)
          .receiveBridgedFunds(
            this.home_chain_id + 1,
            params.seed_deposit.div(10)
          )
      ).to.be.revertedWithCustomError(this.yakisoba, "Unauthorized");
    });

    it("Reverts if minAmount is too low", async function () {
      // Add remote chain
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

      const gasCost: BigNumber[] = await this.yakisoba.estimateDispatchCost(
        [this.home_chain_id, this.home_chain_id + 1],
        [params.seed_deposit, params.seed_deposit]
      );

      const options: any = { value: gasCost[1] };
      await expect(
        this.yakisoba.dispatchAssets(
          [params.seed_deposit],
          [params.seed_deposit.mul(95).div(100)],
          [this.home_chain_id + 1],
          [gasCost[1]],
          [ethers.constants.HashZero],
          options
        )
      )
        .to.be.revertedWithCustomError(this.yakisoba, "MinAmountTooLow")
        .withArgs(params.seed_deposit.mul(97).div(100));
    });

    it("Reverts if slippage is too high", async function () {
      // Add remote chain
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

      const gasCost: BigNumber[] = await this.yakisoba.estimateDispatchCost(
        [this.home_chain_id, this.home_chain_id + 1],
        [params.seed_deposit, params.seed_deposit]
      );

      const options: any = { value: gasCost[1] };
      await expect(
        this.yakisoba.dispatchAssets(
          [params.seed_deposit],
          [params.seed_deposit],
          [this.home_chain_id + 1],
          [gasCost[1]],
          [ethers.constants.HashZero],
          options
        )
      ).to.be.revertedWith("Stargate: slippage too high");
    });

    it("Updates chain debt from the remote allocator", async function () {
      // We compute the parameters for the remote chain
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
      const chainData: ChainData = (await this.yakisoba.chainData(
        this.home_chain_id + 1
      )) as ChainData;
      expect(chainData["debt"]).to.equal(0);

      expect(chainData["maxDeposit"]).to.equal(ethers.constants.MaxUint256);
      expect(chainData["bridge"]).to.equal(this.homeBridgeConnector.address);
      expect(
        await this.yakisoba.bridgeWhitelist(this.homeBridgeConnector.address)
      ).to.equal(true);

      expect(
        await this.homeBridgeConnector.lzChainIdMap(this.home_chain_id + 1)
      ).to.equal(params.lz_remote_chain_id);
      expect(
        await this.homeBridgeConnector.convertLzChainId(
          params.lz_remote_chain_id
        )
      ).to.equal(this.home_chain_id + 1);
      expect(
        await this.homeBridgeConnector.dstPoolIdMap(this.home_chain_id + 1)
      ).to.equal(params.dstPoolId);
      expect(
        await this.homeBridgeConnector.allocatorsMap(this.home_chain_id + 1)
      ).to.equal(this.remoteAllocator.address);

      // Let's dispatch some funds to the remote allocator
      await this.yakisoba.mint(params.seed_deposit, this.deployer.address);
      expect(await this.usdc.balanceOf(this.yakisoba.address)).to.be.equal(
        params.seed_deposit.mul(2)
      );

      const gasCost: BigNumber[] = await this.yakisoba.estimateDispatchCost(
        [this.home_chain_id + 1],
        [params.seed_deposit]
      );

      const options: any = { value: gasCost[0] };
      await expect(
        this.yakisoba.dispatchAssets(
          [params.seed_deposit],
          [params.seed_deposit.mul(98).div(100)],
          [this.home_chain_id + 1],
          [gasCost[0]],
          [ethers.constants.HashZero],
          options
        )
      ).not.to.be.reverted;

      const chainData2: ChainData = (await this.yakisoba.chainData(
        this.home_chain_id + 1
      )) as ChainData;
      expect(chainData2["debt"]).to.equal(params.seed_deposit);

      const allocatorDebt: BigNumber =
        await this.remoteAllocator.totalChainDebt();

      // We have a little less due to the 0.2% fee for the bridge
      expect(allocatorDebt).to.equal(params.seed_deposit.mul(998).div(1000));

      // We send some funds to the allocator to mimick yield
      await this.usdc.transfer(
        this.remoteAllocator.address,
        params.seed_deposit
      );
      expect(
        await this.usdc.balanceOf(this.remoteAllocator.address)
      ).to.be.equal(
        params.seed_deposit.add(params.seed_deposit.mul(998).div(1000))
      );
      expect(await this.remoteAllocator.totalChainDebt()).to.be.equal(
        params.seed_deposit.add(params.seed_deposit.mul(998).div(1000))
      );

      // We update the yakisoba debt for the chain
      const gasCost2: BigNumber =
        await this.remoteBridgeConnector.estimateBridgeCost();
      const remoteDebt: BigNumber = await this.remoteAllocator.totalChainDebt();
      const sharePriceBefore: BigNumber = await this.yakisoba.sharePrice();
      const yakisobaRemoteDebt = await this.yakisoba.chainData(
        this.home_chain_id + 1
      );
      await expect(this.remoteAllocator.updateYakisoba({ value: gasCost2 })).not.to
        .be.reverted;

      // We need now to check if the home connector has received the message

      expect(
        await this.homeBridgeConnector.updateRequests(this.home_chain_id + 1)
      ).to.be.equal(remoteDebt);

      await expect(this.homeBridgeConnector.updateYakisoba(this.home_chain_id + 1))
        .not.to.be.reverted;

      const yakisobaRemoteDebt2 = await this.yakisoba.chainData(
        this.home_chain_id + 1
      );
      expect(await this.yakisoba.totalRemoteAssets()).to.be.equal(remoteDebt);
    });
  });
});
