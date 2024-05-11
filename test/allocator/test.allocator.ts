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
import { Allocator } from "../../typechain-types/contracts/Allocator";
import { Allocator__factory } from "../../typechain-types/factories/contracts/Allocator__factory";
import TransactionRequest from "@ethersproject/providers";

interface ChainData {
  debt: BigNumber;
  maxDeposit: BigNumber;
  bridge: string;
}

const coder: AbiCoder = new ethers.utils.AbiCoder();

describe("test.allocator", function () {
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
      this.lzHome,
      this.stgBridge
    );

    this.remoteBridgeConnector = await fxt.deployRemoteBridgeConnector(
      this.deployer,
      this.homeBridgeConnector,
      this.stgBridge,
      this.lzRemote
    );

    const Strategy: ContractFactory = (await ethers.getContractFactory(
      "MockPipeline"
    )) as ContractFactory;
    this.strategy = await Strategy.deploy(
      ethers.constants.HashZero,
      0,
      this.usdc.address,
      this.allocator.address,
      this.alice.address
    );
  });

  describe("initialize allocator", function () {
    it("Deploys the contract", async function () {
      expect(this.allocator.address).to.not.be.undefined;
    });

    it("Is correctly deployed", async function () {
      expect(await this.allocator.yakisobaChainId()).to.equal(this.home_chain_id);
      expect(await this.allocator.asset()).to.equal(this.usdc.address);
      expect(await this.allocator.owner()).to.equal(this.deployer.address);
    });
  });

  describe("UpdateProxy", function () {
    it("Updates the proxy", async function () {
      const AllocatorFactory = await ethers.getContractFactory("Allocator");
      const Allocator2Factory = await ethers.getContractFactory("Allocator");

      const instance = await upgrades.deployProxy(AllocatorFactory, [
        this.usdc.address,
        this.home_chain_id,
      ]);

      const upgraded = await upgrades.upgradeProxy(
        instance.address,
        Allocator2Factory
      );
      expect(await upgraded.asset()).to.equal(this.usdc.address);
    });

    it("Can't upgrade the proxy if not owner", async function () {
      const AllocatorFactory = await ethers.getContractFactory("Allocator");
      const Allocator2Factory = await ethers.getContractFactory(
        "Allocator",
        this.alice
      );

      const instance = await upgrades.deployProxy(AllocatorFactory, [
        this.usdc.address,
        this.home_chain_id,
      ]);

      await expect(
        upgrades.upgradeProxy(instance.address, Allocator2Factory)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Set Bridge", function () {
    it("Sets the bridge remotely", async function () {
      await expect(this.allocator.setBridge(this.remoteBridgeConnector.address))
        .not.to.be.reverted;
      expect(await this.allocator.bridgeConnector()).to.equal(
        this.remoteBridgeConnector.address
      );
    });

    it("Sets the bridge locally", async function () {
      await expect(this.allocator.setBridge(this.yakisoba.address)).not.to.be
        .reverted;

      expect(await this.allocator.bridgeConnector()).to.equal(
        this.yakisoba.address
      );
    });

    it("Sets the bridge if a bridge is already set", async function () {
      const AllocatorFactory = await ethers.getContractFactory("Allocator");
      const instance = await upgrades.deployProxy(AllocatorFactory, [
        this.usdc.address,
        this.home_chain_id + 1,
      ]);

      await expect(instance.setBridge(this.remoteBridgeConnector.address)).not
        .to.be.reverted;

      expect(await instance.bridgeConnector()).to.equal(
        this.remoteBridgeConnector.address
      );

      await expect(instance.setBridge(this.homeBridgeConnector.address)).not.to
        .be.reverted;

      expect(await instance.bridgeConnector()).to.equal(
        this.homeBridgeConnector.address
      );
    });

    it("Can't update the bridge if we're one the local chain", async function () {
      await expect(this.allocator.setBridge(this.yakisoba.address)).not.to.be
        .reverted;

      await expect(this.allocator.setBridge(this.remoteBridgeConnector.address))
        .to.be.reverted;
    });

    it("Emits an event when the bridge is set", async function () {
      await expect(this.allocator.setBridge(this.remoteBridgeConnector.address))
        .to.emit(this.allocator, "BridgeUpdated")
        .withArgs(this.remoteBridgeConnector.address);
    });

    it("Can't set the bridge if not owner", async function () {
      await expect(
        this.allocator
          .connect(this.alice)
          .setBridge(this.homeBridgeConnector.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("BridgeBackFunds", function () {
    // Some tests are skipped because they are done in crosschain
    it("Can't bridge back funds if not owner", async function () {
      await expect(
        this.allocator.connect(this.alice).bridgeBackFunds(1, 1)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Bridges back to yakisoba if on home chain", async function () {
      this.allocator.setBridge(this.yakisoba.address);
      this.yakisoba.addChain(
        this.home_chain_id,
        ethers.constants.MaxUint256,
        this.allocator.address,
        this.allocator.address,
        this.allocator.address,
        ethers.constants.HashZero
      );

      expect(await this.allocator.bridgeConnector()).to.equal(
        this.yakisoba.address
      );

      await this.usdc.transfer(
        this.allocator.address,
        ethers.utils.parseUnits("1", this.decimals)
      );

      expect(await this.usdc.balanceOf(this.allocator.address)).to.equal(
        ethers.utils.parseUnits("1", this.decimals)
      );

      expect(await this.allocator.totalChainDebt()).to.equal(
        ethers.utils.parseUnits("1", this.decimals)
      );

      this.balanceYakisobaBefore = await this.usdc.balanceOf(this.yakisoba.address);

      await expect(
        this.allocator.bridgeBackFunds(
          ethers.utils.parseUnits("1", this.decimals).div(2),
          0
        )
      ).not.to.be.reverted;

      // We check that the funds are in the yakisoba and the yakisoba has the correct debt
      expect(await this.usdc.balanceOf(this.allocator.address)).to.equal(
        ethers.utils.parseUnits("1", this.decimals).div(2)
      );

      expect(await this.allocator.totalChainDebt()).to.equal(
        ethers.utils.parseUnits("1", this.decimals).div(2)
      );

      expect(await this.usdc.balanceOf(this.yakisoba.address)).to.equal(
        this.balanceYakisobaBefore.add(
          ethers.utils.parseUnits("1", this.decimals).div(2)
        )
      );

      const chainData = await this.yakisoba.chainData(this.home_chain_id);
      expect(chainData[0]).to.equal(
        ethers.utils.parseUnits("1", this.decimals).div(2)
      );
    });

    it("emits an event when funds are bridged back", async function () {
      this.allocator.setBridge(this.yakisoba.address);
      this.yakisoba.addChain(
        this.home_chain_id,
        ethers.constants.MaxUint256,
        this.allocator.address,
        this.allocator.address,
        this.allocator.address,
        ethers.constants.HashZero
      );

      expect(await this.allocator.bridgeConnector()).to.equal(
        this.yakisoba.address
      );

      await this.usdc.transfer(
        this.allocator.address,
        ethers.utils.parseUnits("1", this.decimals)
      );

      expect(await this.usdc.balanceOf(this.allocator.address)).to.equal(
        ethers.utils.parseUnits("1", this.decimals)
      );

      expect(await this.allocator.totalChainDebt()).to.equal(
        ethers.utils.parseUnits("1", this.decimals)
      );

      this.balanceYakisobaBefore = await this.usdc.balanceOf(this.yakisoba.address);

      await expect(
        this.allocator.bridgeBackFunds(
          ethers.utils.parseUnits("1", this.decimals).div(2),
          0
        )
      )
        .to.emit(this.allocator, "BridgeSuccess")
        .withArgs(
          ethers.utils.parseUnits("1", this.decimals).div(2),
          await this.allocator.yakisobaChainId()
        );
    });
  });

  describe("Update yakisoba", function () {
    it("Reverts if the caller is not the owner", async function () {
      await expect(
        this.allocator.connect(this.alice).updateYakisoba()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Add New strategy", function () {
    it("Adds a strategy", async function () {
      await expect(
        this.allocator.addNewStrategy(
          this.strategy.address,
          ethers.constants.MaxUint256,
          "My Strategy"
        )
      ).not.to.be.reverted;

      const strategiesList = await this.allocator.strategiesList(0);
      expect(strategiesList).to.equal(this.strategy.address);
      const strategiesData = await this.allocator.strategiesData(
        this.strategy.address
      );
      expect(strategiesData[0]).to.equal("My Strategy");
      expect(strategiesData[1]).to.equal(true);
      expect(strategiesData[2]).to.equal(ethers.constants.MaxUint256);
      expect(strategiesData[3]).to.equal(0);
    });

    it("Reverts if the strategy already exists", async function () {
      await expect(
        this.allocator.addNewStrategy(
          this.strategy.address,
          ethers.constants.MaxUint256,
          "My Strategy"
        )
      ).not.to.be.reverted;

      await expect(
        this.allocator.addNewStrategy(
          this.strategy.address,
          ethers.constants.MaxUint256,
          "My Strategy"
        )
      ).to.be.revertedWithCustomError(this.allocator, "StrategyAlreadyExists");
    });

    it("Reverts if the caller is not the owner", async function () {
      await expect(
        this.allocator

          .connect(this.alice)
          .addNewStrategy(
            this.strategy.address,
            ethers.constants.MaxUint256,
            "My Strategy"
          )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Emits an event when a strategy is added", async function () {
      await expect(
        this.allocator.addNewStrategy(
          this.strategy.address,
          ethers.constants.MaxUint256,
          "My Strategy"
        )
      )
        .to.emit(this.allocator, "StrategyAdded")
        .withArgs(
          this.strategy.address,
          ethers.constants.MaxUint256,
          "My Strategy"
        );
    });
  });

  describe("setMaxDeposit", function () {
    it("Sets max deposit for a strategy", async function () {
      await expect(
        this.allocator.addNewStrategy(
          this.strategy.address,
          ethers.constants.MaxUint256,
          "My Strategy"
        )
      ).not.to.be.reverted;

      await expect(this.allocator.setMaxDeposit(this.strategy.address, 100)).not
        .to.be.reverted;

      const strategiesData = await this.allocator.strategiesData(
        this.strategy.address
      );
      expect(strategiesData[2]).to.equal(100);
    });

    it("Reverts if the caller is not the owner", async function () {
      await expect(
        this.allocator
          .connect(this.alice)
          .setMaxDeposit(this.strategy.address, 100)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Update strategy debt", function () {
    it("Updates strategy debt", async function () {
      await expect(
        this.allocator.addNewStrategy(
          this.strategy.address,
          ethers.constants.MaxUint256,
          "My Strategy"
        )
      ).not.to.be.reverted;

      expect(await this.usdc.balanceOf(this.strategy.address)).to.equal(0);
      this.usdc.transfer(this.strategy.address, params.seed_deposit);

      expect(await this.usdc.balanceOf(this.strategy.address)).to.equal(
        params.seed_deposit
      );

      expect(await this.allocator.totalChainDebt()).to.equal(0);

      await expect(this.strategy.harvestCompoundUpdate(false)).not.to.be
        .reverted;

      const strategiesData = await this.allocator.strategiesData(
        this.strategy.address
      );
      expect(strategiesData[3]).to.equal(params.seed_deposit);

      // We test if updated debt is lower than the previous one

      const tx = {
        to: this.strategy.address,
        value: ethers.utils.parseEther("1"),
      };

      await this.deployer.sendTransaction(tx);

      const stratFake = await testUtils.address.impersonate(
        this.strategy.address
      );
      await this.usdc
        .connect(stratFake)
        .transfer(this.deployer.address, params.seed_deposit.div(2));

      expect(await this.strategy.totalBalance()).to.equal(
        params.seed_deposit.div(2)
      );

      await expect(this.strategy.harvestCompoundUpdate(false)).not.to.be
        .reverted;

      const strategiesData2 = await this.allocator.strategiesData(
        this.strategy.address
      );
      expect(strategiesData2[3]).to.equal(params.seed_deposit.div(2));

      expect(await this.allocator.totalChainDebt()).to.equal(
        params.seed_deposit.div(2)
      );
    });

    it("Reverts if the strategy does not exist", async function () {
      await expect(
        this.allocator.updateStrategyDebt(this.alice.address)
      ).to.be.revertedWithCustomError(this.allocator, "NotWhitelisted");
    });

    it("Emits events", async function () {
      await expect(
        this.allocator.addNewStrategy(
          this.strategy.address,
          ethers.constants.MaxUint256,
          "My Strategy"
        )
      ).not.to.be.reverted;

      expect(await this.usdc.balanceOf(this.strategy.address)).to.equal(0);
      this.usdc.transfer(this.strategy.address, params.seed_deposit);

      expect(await this.usdc.balanceOf(this.strategy.address)).to.equal(
        params.seed_deposit
      );

      expect(await this.allocator.totalChainDebt()).to.equal(0);

      await expect(this.strategy.harvestCompoundUpdate(false))
        .to.emit(this.allocator, "StrategyUpdate")
        .withArgs(this.strategy.address, params.seed_deposit);

      await expect(this.strategy.harvestCompoundUpdate(false))
        .to.emit(this.allocator, "ChainDebtUpdate")
        .withArgs(params.seed_deposit);
    });

    it("Reverts if the caller is not whitelisted", async function () {
      await expect(
        this.allocator
          .connect(this.alice)
          .updateStrategyDebt(this.strategy.address)
      ).to.be.revertedWithCustomError(this.allocator, "NotWhitelisted");
    });
  });

  describe("Dispatch assets", function () {
    it("Dispatches assets to one strat", async function () {
      await expect(
        this.allocator.addNewStrategy(
          this.strategy.address,
          ethers.constants.MaxUint256,
          "My Strategy"
        )
      ).not.to.be.reverted;

      expect(await this.usdc.balanceOf(this.strategy.address)).to.equal(0);
      await this.usdc.transfer(this.allocator.address, params.seed_deposit);

      await expect(
        this.allocator.dispatchAssets(
          [params.seed_deposit],
          [this.strategy.address]
        )
      ).not.to.be.reverted;

      expect(await this.usdc.balanceOf(this.strategy.address)).to.equal(
        params.seed_deposit
      );

      expect(await this.allocator.totalChainDebt()).to.equal(
        params.seed_deposit
      );

      const strategiesData = await this.allocator.strategiesData(
        this.strategy.address
      );
      expect(strategiesData[3]).to.equal(params.seed_deposit);
    });

    it("Dispatches assets to multiple strats", async function () {
      const Strategy: ContractFactory = (await ethers.getContractFactory(
        "MockPipeline"
      )) as ContractFactory;

      const strategy2 = await Strategy.deploy(
        ethers.constants.HashZero,
        0,
        this.usdc.address,
        this.allocator.address,
        this.alice.address
      );

      await expect(
        this.allocator.addNewStrategy(
          strategy2.address,
          ethers.constants.MaxUint256,
          "My Strategy"
        )
      ).not.to.be.reverted;

      await expect(
        this.allocator.addNewStrategy(
          this.strategy.address,
          ethers.constants.MaxUint256,
          "My Strategy 2"
        )
      ).not.to.be.reverted;

      expect(await this.usdc.balanceOf(this.strategy.address)).to.equal(0);
      expect(await this.usdc.balanceOf(strategy2.address)).to.equal(0);
      await this.usdc.transfer(this.allocator.address, params.seed_deposit);

      await expect(
        this.allocator.dispatchAssets(
          [params.seed_deposit.div(2), params.seed_deposit.div(2)],
          [this.strategy.address, strategy2.address]
        )
      ).not.to.be.reverted;

      expect(await this.usdc.balanceOf(this.strategy.address)).to.equal(
        params.seed_deposit.div(2)
      );
      expect(await this.usdc.balanceOf(strategy2.address)).to.equal(
        params.seed_deposit.div(2)
      );

      expect(await this.allocator.totalChainDebt()).to.equal(
        params.seed_deposit
      );

      const strategiesData = await this.allocator.strategiesData(
        this.strategy.address
      );
      expect(strategiesData[3]).to.equal(params.seed_deposit.div(2));

      const strategiesData2 = await this.allocator.strategiesData(
        strategy2.address
      );
      expect(strategiesData2[3]).to.equal(params.seed_deposit.div(2));
    });

    it("Reverts if the length of the arrays is not the same", async function () {
      await expect(
        this.allocator.dispatchAssets(
          [params.seed_deposit.div(2), params.seed_deposit.div(2)],
          [this.strategy.address]
        )
      ).to.be.revertedWithCustomError(this.allocator, "IncorrectArrayLengths");
    });

    it("Reverts if maxDeposit is reached", async function () {
      await expect(
        this.allocator.addNewStrategy(
          this.strategy.address,
          params.seed_deposit.div(2),
          "My Strategy"
        )
      ).not.to.be.reverted;

      expect(await this.usdc.balanceOf(this.strategy.address)).to.equal(0);
      await this.usdc.transfer(this.allocator.address, params.seed_deposit);

      await expect(
        this.allocator.dispatchAssets(
          [params.seed_deposit],
          [this.strategy.address]
        )
      )
        .to.be.revertedWithCustomError(this.allocator, "MaxDepositReached")
        .withArgs(this.strategy.address);
    });

    it("Reverts if the strategy is not whitelisted", async function () {
      await expect(
        this.allocator.dispatchAssets(
          [params.seed_deposit],
          [this.strategy.address]
        )
      ).to.be.revertedWithCustomError(this.allocator, "NotWhitelisted");
    });

    it("Reverts if the caller is not the owner", async function () {
      await expect(
        this.allocator

          .connect(this.alice)
          .dispatchAssets([params.seed_deposit], [this.strategy.address])
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Emits events", async function () {
      await expect(
        this.allocator.addNewStrategy(
          this.strategy.address,
          ethers.constants.MaxUint256,
          "My Strategy"
        )
      ).not.to.be.reverted;

      expect(await this.usdc.balanceOf(this.strategy.address)).to.equal(0);
      await this.usdc.transfer(this.allocator.address, params.seed_deposit);

      await expect(
        this.allocator.dispatchAssets(
          [params.seed_deposit.div(2)],
          [this.strategy.address]
        )
      )
        .to.emit(this.allocator, "StrategyUpdate")
        .withArgs(this.strategy.address, params.seed_deposit.div(2));

      await expect(
        this.allocator.dispatchAssets(
          [params.seed_deposit.div(2)],
          [this.strategy.address]
        )
      )
        .to.emit(this.allocator, "ChainDebtUpdate")
        .withArgs(params.seed_deposit);
    });
  });

  describe("Retire strategy", function () {
    it("Reverts if the strategy is not whitelisted", async function () {
      await expect(
        this.allocator.retireStrategy(this.strategy.address)
      ).to.be.revertedWithCustomError(this.allocator, "NotWhitelisted");
    });

    it("Retires a strategy", async function () {
      await expect(
        this.allocator.addNewStrategy(
          this.strategy.address,
          ethers.constants.MaxUint256,
          "My Strategy"
        )
      ).not.to.be.reverted;

      await this.usdc.transfer(this.allocator.address, params.seed_deposit);
      await this.allocator.dispatchAssets(
        [params.seed_deposit],
        [this.strategy.address]
      );

      expect(await this.allocator.totalChainDebt()).to.equal(
        params.seed_deposit
      );

      expect(await this.usdc.balanceOf(this.strategy.address)).to.equal(
        params.seed_deposit
      );

      expect(await this.usdc.balanceOf(this.allocator.address)).to.equal(0);

      await expect(this.allocator.retireStrategy(this.strategy.address)).not.to
        .be.reverted;

      const strategiesData = await this.allocator.strategiesData(
        this.strategy.address
      );
      expect(strategiesData[2]).to.equal(0);
      expect(strategiesData[3]).to.equal(0);

      expect(await this.usdc.balanceOf(this.strategy.address)).to.equal(0);
      expect(await this.usdc.balanceOf(this.allocator.address)).to.equal(
        params.seed_deposit
      );
    });

    it("Reverts if the caller is not the owner", async function () {
      await expect(
        this.allocator.connect(this.alice).retireStrategy(this.strategy.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Strategy Map", function () {
    it("Returns the correct strategy map", async function () {
      const Strategy: ContractFactory = (await ethers.getContractFactory(
        "MockPipeline"
      )) as ContractFactory;

      const strategy2 = await Strategy.deploy(
        ethers.constants.HashZero,
        0,
        this.usdc.address,
        this.allocator.address,
        this.alice.address
      );

      await expect(
        this.allocator.addNewStrategy(
          this.strategy.address,
          ethers.constants.MaxUint256,
          "My Strategy"
        )
      ).not.to.be.reverted;

      await expect(
        this.allocator.addNewStrategy(
          strategy2.address,
          ethers.constants.MaxUint256,
          "My Strategy 2"
        )
      ).not.to.be.reverted;

      const strategyMap = await this.allocator.strategyMap();
      const strat1 = strategyMap[0];
      const strat2 = strategyMap[1];
      expect(strat1[0]).to.equal("My Strategy");
      expect(strat1[1]).to.equal(ethers.constants.MaxUint256);
      expect(strat1[2]).to.equal(ethers.constants.Zero);
      expect(strat1[3]).to.equal(ethers.constants.Zero);
      expect(strat1[4]).to.equal(this.strategy.address);
      expect(strat2[0]).to.equal("My Strategy 2");
      expect(strat2[1]).to.equal(ethers.constants.MaxUint256);
      expect(strat2[2]).to.equal(ethers.constants.Zero);
      expect(strat2[3]).to.equal(ethers.constants.Zero);
      expect(strat2[4]).to.equal(strategy2.address);
    });
  });

  describe("Liquidate strategy", function () {
    it("Liquidate a strategy", async function () {
      await expect(
        this.allocator.addNewStrategy(
          this.strategy.address,
          ethers.constants.MaxUint256,
          "My Strategy"
        )
      ).not.to.be.reverted;

      this.usdc.transfer(this.allocator.address, params.seed_deposit);
      await this.allocator.dispatchAssets(
        [params.seed_deposit],
        [this.strategy.address]
      );

      expect(await this.allocator.totalChainDebt()).to.equal(
        params.seed_deposit
      );

      expect(await this.usdc.balanceOf(this.strategy.address)).to.equal(
        params.seed_deposit
      );

      const strategyData = await this.allocator.strategiesData(
        this.strategy.address
      );

      expect(strategyData[3]).to.equal(params.seed_deposit);

      await expect(
        this.allocator.liquidateStrategy(
          params.seed_deposit.div(2),
          0,
          this.strategy.address,
          false
        )
      ).not.to.be.reverted;

      const strategyData2 = await this.allocator.strategiesData(
        this.strategy.address
      );

      expect(strategyData2[3]).to.equal(params.seed_deposit.div(2));

      expect(await this.usdc.balanceOf(this.strategy.address)).to.equal(
        params.seed_deposit.div(2)
      );

      expect(await this.usdc.balanceOf(this.allocator.address)).to.equal(
        params.seed_deposit.div(2)
      );
    });

    it("Emits an event", async function () {
      await expect(
        this.allocator.addNewStrategy(
          this.strategy.address,
          ethers.constants.MaxUint256,
          "My Strategy"
        )
      ).not.to.be.reverted;

      this.usdc.transfer(this.allocator.address, params.seed_deposit);
      await this.allocator.dispatchAssets(
        [params.seed_deposit],
        [this.strategy.address]
      );

      await expect(
        this.allocator.liquidateStrategy(
          params.seed_deposit.div(2),
          0,
          this.strategy.address,
          false
        )
      )
        .to.emit(this.allocator, "ChainDebtUpdate")
        .withArgs(params.seed_deposit);
    });

    it("Liquidates strategy if the liquidation fails", async function () {
      // Liquidate will trigger a revert
      const Strategy: ContractFactory = (await ethers.getContractFactory(
        "MockPipeline"
      )) as ContractFactory;
      this.strategy = await Strategy.deploy(
        ethers.constants.HashZero,
        0,
        this.usdc.address,
        this.allocator.address,
        this.alice.address
      );

      this.strategy.setFailLiquidate(true);
      expect(await this.strategy.failLiquidate()).to.equal(true);

      await expect(
        this.allocator.addNewStrategy(
          this.strategy.address,
          ethers.constants.MaxUint256,
          "My Strategy"
        )
      ).not.to.be.reverted;

      this.usdc.transfer(this.allocator.address, params.seed_deposit);
      await this.allocator.dispatchAssets(
        [params.seed_deposit],
        [this.strategy.address]
      );

      expect(await this.allocator.totalChainDebt()).to.equal(
        params.seed_deposit
      );

      expect(await this.usdc.balanceOf(this.strategy.address)).to.equal(
        params.seed_deposit
      );

      const strategyData = await this.allocator.strategiesData(
        this.strategy.address
      );

      expect(strategyData[3]).to.equal(params.seed_deposit);

      await expect(
        this.allocator.liquidateStrategy(
          params.seed_deposit.div(2),
          0,
          this.strategy.address,
          false
        )
      ).not.to.be.reverted;

      const strategyData2 = await this.allocator.strategiesData(
        this.strategy.address
      );

      expect(strategyData2[3]).to.equal(0);

      expect(await this.usdc.balanceOf(this.strategy.address)).to.equal(0);

      expect(await this.usdc.balanceOf(this.allocator.address)).to.equal(
        params.seed_deposit
      );

      // We can still liquidate the strategy if there is nothing in it
      await expect(
        this.allocator.liquidateStrategy(
          params.seed_deposit.div(2),
          0,
          this.strategy.address,
          false
        )
      ).not.to.be.reverted;
    });

    it("Reverts if the caller is not the owner", async function () {
      await expect(
        this.allocator
          .connect(this.alice)
          .liquidateStrategy(
            params.seed_deposit.div(2),
            0,
            this.strategy.address,
            false
          )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Reverts if the strategy is not whitelisted", async function () {
      await expect(
        this.allocator.liquidateStrategy(
          params.seed_deposit.div(2),
          0,
          this.strategy.address,
          false
        )
      ).to.be.revertedWithCustomError(this.allocator, "NotWhitelisted");
    });
  });
});
