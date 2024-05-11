import { task } from "hardhat/config";
const { expect } = require("chai");

import DeploymentTools from "../../utils/DeploymentsTools";
import { DeployParams } from "../../utils/types";

import { getDeployerWallet } from "../../utils/networks";
import { BigNumber, Contract, ContractFactory, utils, Wallet } from "ethers";

//NOTE - this file is a template to speed up the interaction with deployed contracts

task("act:template", "Template for interacting with deployed contracts")
  .addParam(
    "deployment",
    "Which deployment to target(production, alpha, staging)"
  )
  .addParam("local", "Whether the deployment is ran locally")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    const deployer: Wallet = await getDeployerWallet(ethers.provider);
    const { getConstants, getDeployedContract } = DeploymentTools;

    const deploy: string = taskArgs.deployment;
    const local: boolean = taskArgs.local == "true" ? true : false;
    const { a, p } = getConstants(deploy, "home_chain_id"); //NOTE - Modify this if needed

    const homeChainId = p.home_chain_id; //NOTE - Modify this if needed

    const DeployParams: DeployParams = {
      provider: deployer,
      deploy: deploy,
      local: local,
      chainId: homeChainId, //NOTE - Modify this if needed
    };

    const deployedContract: Contract = await getDeployedContract(
      "ContractName", //NOTE - Modify this if needed
      DeployParams
    );
  });
