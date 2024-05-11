require("dotenv").config();
require("hardhat-abi-exporter");
require("hardhat-spdx-license-identifier");
import { generateWalletsFromMnemonic } from "./utils/networks";

import "@typechain/hardhat";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "@nomiclabs/hardhat-etherscan";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-ganache";
import "@nomiclabs/hardhat-ethers";
import "hardhat-ignore-warnings";
import "solidity-coverage";
import "hardhat-test-utils";
import "hardhat-gas-reporter";
import "hardhat-log-remover";
import "hardhat-contract-sizer";
import "hardhat-address-exporter";

import "@primitivefi/hardhat-dodoc";

import { HardhatUserConfig } from "hardhat/types";
import { config as dotEnvConfig } from "dotenv";
import { task } from "hardhat/config";
const path = require("node:path");

const rpc_avax: string = process.env.RPC_AVALANCHE as string;
const rpc_fuji: string = process.env.RPC_FUJI as string;
const rpc_mumbai: string = process.env.RPC_MUMBAI as string;
const rpc_mainnet: string = process.env.RPC_MAINNET as string;
const rpc_ftmTestnet: string = "https://rpc.testnet.fantom.network";
const rpc_bsc: string = process.env.RPC_BSC as string;
const rpc_bsc_testnet: string = process.env.RPC_BSC_TESTNET as string;
const rpc_arbitrum: string = process.env.RPC_ARBITRUM as string;
const etherscan_api_key: string = process.env.ETHERSCAN_API_KEY as string;
const arbiscan_api_key: string = process.env.ARBISCAN_API_KEY as string;

require("./tasks/deployMock/wave.1");
require("./tasks/deployMock/wave.2");
require("./tasks/deployMock/wave.3");

require("./tasks/deployMock/test/test:deploy:home.ts");
require("./tasks/deployMock/test/test:deploy:remote.ts");

require("./tasks/deployMock/wave.1/deploy:wave1:yakisoba");
require("./tasks/deployMock/wave.1/deploy:wave1:allocator");
require("./tasks/deployMock/wave.1/deploy:wave1:bridge");
require("./tasks/deployMock/wave.1/deploy:wave1:elb");
require("./tasks/deployMock/wave.1/deploy:wave1:strategyMock");

require("./tasks/deployMock/wave.2/deploy:wave2:allocator");
require("./tasks/deployMock/wave.2/deploy:wave2:bridge");
require("./tasks/deployMock/wave.2/deploy:wave2:strategyMock");
require("./tasks/deployMock/wave.2/deploy:wave2:setup");

require("./tasks/deployMock/wave.3/deploy:wave3:setup");
require("./tasks/deployMock/wave.3/deploy:wave3:save");

require("./tasks/deployProd/deploy:prod:allocator");
require("./tasks/deployProd/deploy:prod:homeBridgeStg");
require("./tasks/deployProd/deploy:prod:yakisoba");
require("./tasks/deployProd/deploy:prod:elb");

require("./tasks/deployProd/test/test:core:prod");

const testMnemonic = "test test test test test test test test";
const dummyWallets = generateWalletsFromMnemonic(testMnemonic, 10);
const rpc_mainnet_height = 16720915;

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      accounts: [
        {
          privateKey: process.env.DEPLOYER_PK as string,
          balance: "100000000000000000000000000",
        },
        {
          privateKey: dummyWallets[0].privateKey,
          balance: "10000000000000000000000",
        },
        {
          privateKey: dummyWallets[1].privateKey,
          balance: "10000000000000000000000",
        },

        {
          privateKey: dummyWallets[2].privateKey,
          balance: "10000000000000000000000",
        },
      ],
      forking: {
        url: rpc_mainnet,
        blockNumber: rpc_mainnet_height,
      },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    localhost_remote: {
      url: "http://127.0.0.1:8546",
    },
    mumbai: {
      url: rpc_mumbai,
    },
    ftm_testnet: {
      url: rpc_ftmTestnet,
    },
    avalanche: {
      url: rpc_avax,
      chainId: 43114,
    },
    bsc: {
      url: rpc_bsc,
      chainId: 56,
    },
    fuji: {
      url: rpc_fuji,
      chainId: 43113,
    },
    bsc_testnet: {
      url: rpc_bsc_testnet,
      chainId: 97,
    },
    arbitrum: {
      url: rpc_arbitrum,
      chainId: 42161,
    },
  },
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  etherscan: {
    apiKey: {
      // npx hardhat verify --list-networks to check network names
      mainnet: etherscan_api_key,
      arbitrumOne: arbiscan_api_key,
    },
  },

  gasReporter: {
    currency: "USD",
    gasPrice: 18,
    enabled: process.env.REPORT_GAS == "true" ? true : false,
    coinmarketcap: process.env.CMC_API_KEY,
    token: "ETH",
    outputFile: "gas-report.txt",
  },
  contractSizer: {
    alphaSort: false,
    disambiguatePaths: true,
    runOnCompile: false,
    strict: true,
    except: [
      "/external",
      "/interfaces",
      "/mocks",
      "/test",
      "/utils",
      "misc",
      "@openzeppelin",
      "hardhat",
    ],
  },
  mocha: {
    timeout: 100000000,
    reporter: "mocha-multi",
    reporterOptions: {
      spec: "-", // default mocha reporter
      json: "./test-report.json",
    },
  },
  spdxLicenseIdentifier: {
    overwrite: true,
    runOnCompile: false,
    except: ["vendor/"],
  },
  addressExporter: {
    outDir: path.resolve("./addresses"),
    runPrettier: false,
  },
  abiExporter: {
    path: "./abi/pretty",
    runOnCompile: false,
    clear: true,
    flat: true,
    spacing: 2,
    // pretty: true,
    format: "json",
    // filter: () => true,
    // format: "minimal",
  },
  dodoc: {
    runOnCompile: false,
    debugMode: false,
    exclude: [
      "interfaces",
      "external",
      "mocks",
      "test",
      "utils",
      "contracts-exposed",
    ],
    freshOutput: true,
  },
};

export default config;
