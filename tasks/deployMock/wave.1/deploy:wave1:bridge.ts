import { task } from "hardhat/config";
import { Contract, ContractFactory, utils, Wallet } from "ethers";
var assert = require("assert");
import { DeployParams } from "../../../utils/types";

import { getDeployerWallet } from "../../../utils/networks";
import DeploymentTools from "../../../utils/DeploymentsTools";

import { Deployment } from "../../../utils/types";

task("deploy:wave1:bridge", "Deploys the BridgeConnector contract")
  .addParam("deployment", "The deployment to run (production, alpha, staging)")
  .addParam("local", "Whether the deployment is ran locally")
  .setAction(async (taskArgs, hre) => {
    const ethers = hre.ethers;
    const {
      saveDeployment,
      getDeployedContract,
      getConstantsMock,
      getHomeChainId,
    } = DeploymentTools;

    const deploy: string = taskArgs.deployment;
    const local: boolean = taskArgs.local == "true" ? true : false;

    const { a, p } = getConstantsMock(deploy, "home_chain_id");
    const homeChainId = getHomeChainId(hre, deploy);
    const usdc = a.usdc;

    const deployer: Wallet = await getDeployerWallet(ethers.provider);

    const bridgeHomeFactory: ContractFactory = await ethers.getContractFactory(
      "BridgeConnectorHomeSTG",
      deployer
    );

    const deployParams: DeployParams = {
      provider: deployer,
      local: local,
      chainId: homeChainId,
      deploy: deploy,
    };

    const yakisoba: Contract = await getDeployedContract("Yakisoba", deployParams);

    const bridgeConnectorHomeSTG: Contract = (await bridgeHomeFactory.deploy(
      yakisoba.address,
      a.usdc,
      a.stg_router,
      a.layer_zero,
      p.homeSrcPoolId,
      p.lz_home_chain_id
    )) as Contract;

    await bridgeConnectorHomeSTG.deployed();

    console.log("Home bridge deployed to: \t", bridgeConnectorHomeSTG.address);

    const bridgeConnectorHomeSTGDeployment: Deployment = {
      name: "BridgeConnectorHomeSTG",
      address: bridgeConnectorHomeSTG.address,
      chainId: homeChainId,
      contract: "BridgeConnectorHomeSTG",
      deployTransaction: bridgeConnectorHomeSTG.deployTransaction.hash,
      args: [
        yakisoba.address,
        a.usdc,
        a.stg_router,
        a.layer_zero,
        p.lz_home_chain_id,
        1,
      ],
      verified: false,
      deployer: deployer.address,
    };

    await saveDeployment(deploy, bridgeConnectorHomeSTGDeployment, local);
  });
