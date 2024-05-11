import { task } from "hardhat/config";
import { BigNumber, Contract, Wallet } from "ethers";
import { getDeployerWallet } from "../../../utils/networks";
import DeploymentTools from "../../../utils/DeploymentsTools";
import { DeployParams } from "../../../utils/types";
import chainIds from "../../../utils/constants/chains";
import { expect } from "chai";

task("test:core:prod", "Test the core contracts on the home chain")
  .addParam("local", "Whether deploy is done locally or not")
  .addParam("chain", "Where the contracts are deployed")
  .addParam("asset", "The base asset to used for the deployment")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;
    const homeChainId = 42161; // Arbitrum
    const chainId = chainIds[taskArgs.chain];
    const local = taskArgs.local == "true" ? true : false;
    const deploy: string = "production";

    const { getConstants, getDeployedContract, makeContractName } =
      DeploymentTools;

    const { a, p } = getConstants(chainId);
    const deployer: Wallet = await getDeployerWallet(ethers.provider);
    const assetName = taskArgs.asset;
    const assetAddress = a[assetName];

    const deployParams: DeployParams = {
      local: local,
      deploy: deploy,
      chainId: homeChainId,
      provider: deployer,
    };

    const yakisoba: Contract = await getDeployedContract(
      makeContractName("Yakisoba", assetName, chainId),
      deployParams
    );

    const allocator: Contract = await getDeployedContract(
      makeContractName("Allocator", assetName, chainId),
      deployParams
    );

    const swap: Contract = await getDeployedContract(
      makeContractName("Swap", assetName, chainId),
      deployParams
    );

    const homeBridgeStg: Contract = await getDeployedContract(
      makeContractName("BridgeConnectorHomeSTG", assetName, chainId),
      deployParams
    );

    const asset: Contract = await ethers.getContractAt(
      "IERC20Metadata",
      assetAddress,
      deployer
    );

    const decimals: BigNumber = await asset.decimals();

    // We check that we have the correct asset
    expect(await yakisoba.asset()).to.be.equal(asset.address);
    console.log("Yakisoba asset is correct ✅");

    // We check that the share price is ok
    expect(await yakisoba.sharePrice()).to.be.equal(
      ethers.utils.parseUnits("1", decimals)
    );
    expect(await yakisoba.decimals()).to.be.equal(decimals);
    expect(await allocator.asset()).to.be.equal(asset.address);

    expect(await homeBridgeStg.asset()).to.be.equal(asset.address);

    expect(await swap.UNDERLYING_TOKENS(1)).to.be.equal(asset.address);
    expect(await swap.UNDERLYING_TOKENS(0)).to.be.equal(
      ethers.constants.AddressZero
    );
    expect(await swap.getPooledToken(1)).to.be.equal(a.aave_usdc);
    expect(await swap.getPooledToken(0)).to.be.equal(
      ethers.constants.AddressZero
    );

    console.log("Yakisoba share price is correct ✅");

    // We check the that the home bridge is correctly set
    expect(await homeBridgeStg.yakisoba()).to.be.equal(yakisoba.address);
    expect(await homeBridgeStg.stgEndpoint()).to.be.equal(a.stg_router);
    expect(await homeBridgeStg.srcPoolId()).to.be.equal(
      p.srcPoolid[asset.address]
    );

    const chainFromChainlist = await yakisoba.chainList(0);
    expect(chainFromChainlist).to.be.equal(homeChainId);

    const chainData = await yakisoba.chainData(homeChainId);
    expect(chainData[2]).to.be.equal(allocator.address);

    console.log("Yakisoba home bridge is correct ✅");

    // We try some interactions
    expect(
      (
        await yakisoba.estimateDispatchCost(
          [homeChainId],
          [ethers.utils.parseUnits("1", decimals)]
        )
      ).toString()
    ).to.be.equal([ethers.constants.Zero].toString());

    console.log("Yakisoba estimate dispatch cost is correct for home ✅");
  });
