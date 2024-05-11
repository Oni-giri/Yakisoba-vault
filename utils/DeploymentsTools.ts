import * as fs from "fs";
import { Contract, Wallet } from "ethers";
import {
  Deployment,
  Deployments,
  DeploymentIdentifier,
  RegistryLight,
  ContractData,
  DeployParams,
} from "./types";
import ethers from "ethers";
import { Interface } from "ethers/lib/utils";
import addressesMock from "./constants/mocks/addressesMock";
import paramsMock from "./constants/mocks/paramsMock";
import params from "./constants/params";
import addresses from "./constants/addresses";
var assert = require("assert");

async function getDeploymentFile(
  deploy: string,
  chainId: number,
  local: boolean
): Promise<Deployments> {
  const filePath =
    "./registry" +
    (local ? "/local" : "") +
    "/full/" +
    deploy +
    "." +
    chainId.toString() +
    ".json";

  const deployments: any = JSON.parse(fs.readFileSync(filePath).toString());
  return deployments as Deployments;
}

async function getDeployedContract(
  name: string,
  params: DeployParams
): Promise<Contract> {
  const deployments: Deployments = (await getDeploymentFile(
    params.deploy,
    params.chainId,
    params.local
  )) as Deployments;
  const deployment: Deployment = deployments[name];
  const abi = JSON.parse(
    fs.readFileSync(`abi/pretty/${deployment.contract}.json`).toString()
  );

  const contract: Contract = new Contract(
    deployment.address,
    abi,
    params.provider
  );

  return contract;
}

async function getDeployment(
  deploy: string,
  chainId: number,
  name: string,
  local: boolean
): Promise<Deployment> {
  const deployments: Deployments = await getDeploymentFile(
    deploy,
    chainId,
    local
  );

  return deployments[name];
}

async function getAbi(contract: string) {
  const abi = JSON.parse(
    fs.readFileSync(`abi/pretty/${contract}.json`).toString()
  );
  return abi;
}

async function saveDeployment(
  deploy: string,
  deployment: Deployment,
  local: boolean
) {
  const filePath =
    "./registry/" +
    (local ? "local/" : "") +
    "full/" +
    deploy +
    "." +
    deployment.chainId.toString() +
    ".json";

  let deployments: Deployments = {};

  if (fs.existsSync(filePath)) {
    // Loading existing deployments
    deployments = JSON.parse(fs.readFileSync(filePath).toString());
  }

  // We save the deployment
  deployments[deployment.name] = deployment;

  // We write the file
  fs.writeFileSync(filePath, JSON.stringify(deployments));
}

async function writeLightRegistry(
  deploy: string,
  deployment: Deployment,
  local: boolean
) {
  assert(deployment != null, "deployment is undefined");
  let registryLight: RegistryLight = {};
  const filePath =
    "./registry/" +
    (local ? "local/" : "") +
    deploy +
    "." +
    deployment.chainId.toString() +
    ".json";

  if (fs.existsSync(filePath)) {
    registryLight = JSON.parse(fs.readFileSync(filePath).toString());
  }

  const data: ContractData = {
    address: deployment.address.toString(),
    name: deployment.name.toString(),
  };

  registryLight[deployment.name] = data;
  console.log("Writing light registry for contract " + deployment.name);

  fs.writeFileSync(filePath, JSON.stringify(registryLight));
}

// Get constants for mock deploys (alpha, staging)
function getConstantsMock(deploy: string, chain: string): any {
  return {
    p: paramsMock[deploy],
    a: addressesMock[deploy][paramsMock[deploy][chain]],
  };
}

function getConstants(chain: number): any {
  return {
    p: params[chain],
    a: addresses[chain],
  };
}

async function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

// TODO: check this
function getHomeChainId(hre: any, deploy: string) {
  const chainId =
    deploy == "production" ? 42161 : paramsMock[deploy]["home_chain_id"];
  return chainId;
}

function makeContractName(contract: string, asset: string, chainid: number) {
  if (contract == "Yakisoba") {
    return "Astrolab's " + asset.toUpperCase() + " Yakisoba";
  }
  return (
    contract +
    " " +
    asset.toLocaleUpperCase() +
    " " +
    params[chainid]["chain_name"]
  );
}

export default {
  getDeployment,
  saveDeployment,
  getDeployedContract,
  writeLightRegistry,
  getAbi,
  getConstants,
  getConstantsMock,
  sleep,
  getHomeChainId,
  makeContractName,
};
