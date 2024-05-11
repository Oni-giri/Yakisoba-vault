import { BigNumber, Contract, ContractFactory } from "ethers";
import { ethers, upgrades } from "hardhat";

import { Allocator } from "../../typechain-types/contracts/Allocator";
import { AmplificationUtils } from "../../typechain-types/contracts/AmplificationUtils";
import { BridgeConnectorHomeSTG } from "../../typechain-types/contracts/cross-chain/BridgeConnectorHomeSTG.sol";
import { BridgeConnectorRemoteSTG } from "../../typechain-types/contracts/cross-chain/BridgeConnectorRemoteSTG";
import { Yakisoba } from "../../typechain-types/contracts/Yakisoba";
import { IERC20Metadata } from "../../typechain-types/@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata";
import { LZEndpointMock } from "../../typechain-types/contracts/external/solidity-examples/contracts/mocks/LZEndpointMock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { StargateRouterBasicMock } from "../../typechain-types/contracts/mocks/StargateRouterMock.sol/StargateRouterBasicMock";
import { Swap } from "../../typechain-types/contracts/Swap.sol/Swap";
import { SwapUtils } from "../../typechain-types/contracts/SwapUtils";
import a from "./mainnet-adresses";
import params from "./params";
import { IERC1155 } from "../../typechain-types/@openzeppelin/contracts/token/ERC1155/IERC1155";

const { getContractAddress } = require("@ethersproject/address");

const getDeployer = async function (): Promise<SignerWithAddress> {
  const acct: SignerWithAddress[] = await ethers.getSigners();
  return acct[0];
};

const getAlice = async function (): Promise<SignerWithAddress> {
  const acct: SignerWithAddress[] = await ethers.getSigners();
  return acct[1];
};

const getBob = async function (): Promise<SignerWithAddress> {
  const acct: SignerWithAddress[] = await ethers.getSigners();
  return acct[2];
};

const getUSDC = async function (
  deployer: SignerWithAddress
): Promise<BigNumber> {
  const unirouter = await ethers.getContractAt(
    "IUniswapV2Router02",
    a.uniswap_router_v2
  );

  await unirouter.swapExactETHForTokens(
    0,
    [a.weth, a.usdc],
    deployer.address,
    Date.now() + 100,
    { value: ethers.utils.parseUnits("2", 18) }
  );

  const usdc = await ethers.getContractAt("IERC20", a.usdc);

  return usdc.balanceOf(deployer.address);
};

const getUSDCToken = async function (
  deployer: SignerWithAddress
): Promise<IERC20Metadata> {
  const usdc: IERC20Metadata = (await ethers.getContractAt(
    "IERC20Metadata",
    a.usdc
  )) as IERC20Metadata;
  return usdc;
};

const getAaveUSDC = async function (
  deployer: SignerWithAddress
): Promise<IERC20Metadata> {
  const aaveUSDC: IERC20Metadata = (await ethers.getContractAt(
    "IERC20Metadata",
    a.aave_usdc
  )) as IERC20Metadata;
  return aaveUSDC;
};

const deployYakisoba = async function (
  deployer: SignerWithAddress
): Promise<Yakisoba> {
  const Yakisoba = await ethers.getContractFactory("Yakisoba");
  const yakisoba: Yakisoba = (await Yakisoba.deploy(
    a.usdc,
    params.yakisoba_name,
    params.yakisoba_symbol,
    params.performance_fee,
    params.management_fee,
    params.withdraw_fee
  )) as Yakisoba;
  await yakisoba.deployed();

  const usdc: IERC20Metadata = await getUSDCToken(deployer);
  await getUSDC(deployer);
  await usdc.approve(yakisoba.address, ethers.constants.MaxUint256);
  // Yakisoba is paused on startup, so we'll need to unpause it
  return yakisoba;
};

const deploySwap = async function (
  deployer: SignerWithAddress,
  yakisoba: Contract
): Promise<Swap> {
  const virtual_token = "0x0000000000000000000000000000000000000000";
  const aave_usdc_decimals: BigNumber = await (
    await ethers.getContractAt("IERC20Metadata", a.aave_usdc)
  ).decimals();

  const decimals: BigNumber[] = [aave_usdc_decimals, aave_usdc_decimals];
  const aave_tokens: String[] = [virtual_token, a.aave_usdc];
  const real_tokens: String[] = [virtual_token, a.usdc];
  const swapUtils: SwapUtils = (await (
    await ethers.getContractFactory("SwapUtils", deployer)
  ).deploy()) as SwapUtils;

  const amplificationUtils: AmplificationUtils = (await (
    await ethers.getContractFactory("AmplificationUtils", deployer)
  ).deploy()) as AmplificationUtils;

  const Swap = await ethers.getContractFactory("Swap", {
    signer: deployer,
    libraries: {
      AmplificationUtils: amplificationUtils.address,
      SwapUtils: swapUtils.address,
    },
  });
  const swap: Swap = (await Swap.deploy(
    aave_tokens,
    real_tokens,
    decimals,
    params.initial_a,
    a.aave_lending_pool,
    yakisoba.address
  )) as Swap;
  await swap.deployed();
  return swap;
};

const deployMockAave = async function (
  deployer: SignerWithAddress,
  mock: string,
  asset: string
): Promise<Contract> {
  const MockAave = await ethers.getContractFactory(mock, deployer);
  const mockAave = (await MockAave.deploy(asset)) as Contract;
  await mockAave.deployed();
  return mockAave;
};

const deploySwapWithAaveMock = async function (
  deployer: SignerWithAddress,
  yakisoba: Contract,
  aaveMock: Contract
): Promise<Swap> {
  const virtual_token = "0x0000000000000000000000000000000000000000";
  const aave_usdc_decimals: BigNumber = await (
    await ethers.getContractAt("IERC20Metadata", a.aave_usdc)
  ).decimals();

  const decimals: BigNumber[] = [aave_usdc_decimals, aave_usdc_decimals];
  const aave_tokens: String[] = [virtual_token, aaveMock.address];
  const real_tokens: String[] = [virtual_token, a.usdc];
  const swapUtils: SwapUtils = (await (
    await ethers.getContractFactory("SwapUtils", deployer)
  ).deploy()) as SwapUtils;

  const amplificationUtils: AmplificationUtils = (await (
    await ethers.getContractFactory("AmplificationUtils", deployer)
  ).deploy()) as AmplificationUtils;

  const Swap = await ethers.getContractFactory("Swap", {
    signer: deployer,
    libraries: {
      AmplificationUtils: amplificationUtils.address,
      SwapUtils: swapUtils.address,
    },
  });
  const swap: Swap = (await Swap.deploy(
    [virtual_token, aaveMock.address],
    real_tokens,
    decimals,
    params.initial_a,
    aaveMock.address,
    yakisoba.address
  )) as Swap;
  await swap.deployed();

  const usdc: Contract = (await getUSDCToken(deployer)) as Contract;
  // We approve for ease of use
  usdc.approve(swap.address, ethers.constants.MaxUint256);
  return swap;
};

const deployHomeAllocator = async function (
  deployer: SignerWithAddress
): Promise<Allocator> {
  const Allocator = await ethers.getContractFactory("Allocator", deployer);
  const localChainId = (await ethers.provider.getNetwork()).chainId;
  const allocator: Allocator = (await upgrades.deployProxy(Allocator, [
    a.usdc,
    localChainId,
  ])) as Allocator;
  await allocator.deployed();
  return allocator;
};

const deployRemoteAllocator = async function (
  deployer: SignerWithAddress
): Promise<Allocator> {
  const Allocator: ContractFactory = await ethers.getContractFactory(
    "Allocator",
    deployer
  );
  const localChainId = (await ethers.provider.getNetwork()).chainId;
  const allocator: Allocator = (await upgrades.deployProxy(Allocator, [
    a.usdc,
    localChainId + 1,
  ])) as Allocator;
  return allocator;
};

const deployLzHomeMock = async function (
  deployer: SignerWithAddress
): Promise<LZEndpointMock> {
  const LZEndpointMock = await ethers.getContractFactory(
    "LZEndpointMock",
    deployer
  );
  const lz_home: LZEndpointMock = (await LZEndpointMock.deploy(
    params.lz_home_chain_id
  )) as LZEndpointMock;
  await lz_home.deployed();
  return lz_home;
};

const deployLzRemoteMock = async function (
  deployer: SignerWithAddress
): Promise<LZEndpointMock> {
  const LZEndpointMock = await ethers.getContractFactory(
    "LZEndpointMock",
    deployer
  );
  const lz_remote: LZEndpointMock = (await LZEndpointMock.deploy(
    params.lz_remote_chain_id
  )) as LZEndpointMock;
  await lz_remote.deployed();
  return lz_remote;
};

const setupLzMocks = async function (
  deployer: SignerWithAddress,
  lz_home: LZEndpointMock,
  lz_remote: LZEndpointMock,
  homeBridgeConnector: BridgeConnectorHomeSTG,
  remoteBridgeConnector: BridgeConnectorRemoteSTG
) {
  lz_home.setDestLzEndpoint(remoteBridgeConnector.address, lz_remote.address);
  lz_remote.setDestLzEndpoint(homeBridgeConnector.address, lz_home.address);
};

const deployStgMock = async function (
  deployer: SignerWithAddress
): Promise<StargateRouterBasicMock> {
  const StgMock = await ethers.getContractFactory(
    "StargateRouterBasicMock",
    deployer
  );
  const stg = (await StgMock.deploy(
    a.usdc,
    a.stg_router,
    params.dstPoolId,
    params.lz_remote_chain_id,
    params.lz_home_chain_id
  )) as StargateRouterBasicMock;
  await stg.deployed();
  return stg;
};

const deployHomeBridge = async function (
  deployer: SignerWithAddress,
  yakisoba: Contract,
  stg_mock: Contract,
  lz_home: Contract
): Promise<BridgeConnectorHomeSTG> {
  const Bridge = await ethers.getContractFactory(
    "BridgeConnectorHomeSTG",
    deployer
  );
  const bridge = (await Bridge.deploy(
    yakisoba.address,
    a.usdc,
    stg_mock.address,
    lz_home.address,
    1,
    params.lz_home_chain_id
  )) as BridgeConnectorHomeSTG;
  await bridge.deployed();
  return bridge;
};

const deployRemoteBridgeConnector = async function (
  deployer: SignerWithAddress,
  home_bridge: Contract,
  stg_mock: Contract,
  lz_remote: Contract
): Promise<BridgeConnectorRemoteSTG> {
  const Bridge = await ethers.getContractFactory(
    "BridgeConnectorRemoteSTG",
    deployer
  );
  const bridge: BridgeConnectorRemoteSTG = (await Bridge.deploy(
    a.usdc,
    params.lz_home_chain_id,
    home_bridge.address,
    1,
    1,
    stg_mock.address,
    lz_remote.address,
    200_000,
    200_000
  )) as BridgeConnectorRemoteSTG;
  await bridge.deployed();
  return bridge;
};

const deployMockERC20 = async function (
  deployer: SignerWithAddress,
  name: string,
  symbol: string,
  supply: BigNumber
): Promise<Contract> {
  const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
  const erc20: Contract = (await MockERC20.deploy(
    name,
    symbol,
    supply
  )) as Contract;
  await erc20.deployed();
  return erc20;
};

export {
  getDeployer,
  getAlice,
  getBob,
  getUSDC,
  getUSDCToken,
  getAaveUSDC,
  deployYakisoba,
  deploySwap,
  deploySwapWithAaveMock,
  deployMockAave,
  deployHomeAllocator,
  deployRemoteAllocator,
  deployLzHomeMock,
  deployLzRemoteMock,
  deployStgMock,
  deployHomeBridge,
  deployRemoteBridgeConnector,
  deployMockERC20,
  setupLzMocks,
};
