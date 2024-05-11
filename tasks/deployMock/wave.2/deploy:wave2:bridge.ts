import { task } from "hardhat/config";
import { Deployment } from "../../../utils/types";
import DeploymentTools from "../../../utils/DeploymentsTools";

import { getDeployerWallet } from "../../../utils/networks";
var assert = require("assert");

import { Contract, ContractFactory, Wallet } from "ethers";

task("deploy:wave2:bridge", "Deploys the Yakisoba contract")
  .addParam("deployment", "The deployment to run (production, alpha, staging)")
  .addParam("local", "Whether the deployment is ran locally")
  .setAction(async (taskArgs, hre) => {
    const ethers = hre.ethers;

    const deploy: string = taskArgs.deployment;
    const local: boolean = taskArgs.local == "true" ? true : false;

    const deployer: Wallet = await getDeployerWallet(ethers.provider);
    const { saveDeployment, getConstantsMock, getHomeChainId } =
      DeploymentTools;

    const { a, p } = getConstantsMock(deploy, "remote_chain_id");
    const homeChainId = getHomeChainId(hre, deploy);
    const remoteChainId: number = p.remote_chain_id;
    const usdc: string = a.usdc;

    const homeBridgeDeployment: Deployment =
      await DeploymentTools.getDeployment(
        deploy,
        homeChainId,
        "BridgeConnectorHomeSTG",
        local
      );

    const BrigeConnectorRemoteSTG: ContractFactory =
      await ethers.getContractFactory("BridgeConnectorRemoteSTG", deployer);

    const remoteBridge: Contract = await BrigeConnectorRemoteSTG.deploy(
      usdc,
      p.lz_home_chain_id,
      homeBridgeDeployment.address,
      p.homeSrcPoolId,
      p.remoteSrcPoolId,
      a.stg_router,
      a.layer_zero,
      p.bridgeGasAmount,
      p.updateGasAmount
    );

    await remoteBridge.deployed();

    const remoteBridgeDeployment: Deployment = {
      name: "BridgeConnectorRemoteSTG",
      address: remoteBridge.address,
      chainId: remoteChainId,
      contract: "BridgeConnectorRemoteSTG",
      deployTransaction: remoteBridge.deployTransaction.hash,
      args: [
        usdc,
        homeChainId,
        homeBridgeDeployment.address,
        1,
        1,
        a.stg_router,
        a.layer_zero,
        200_000,
        200_000,
      ],
      verified: false,
      deployer: deployer.address,
    };

    await saveDeployment(deploy, remoteBridgeDeployment, local);

    console.log("Remote bridge deployed to: \t", remoteBridge.address);
  });
