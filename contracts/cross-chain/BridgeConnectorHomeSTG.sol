// SPDX-License-Identifier: GPL-3.0-or-later
/**
    Note for the non-lawyers: The licence says that, if you fork:
    - The source code is made available to the public in source code form under the same license
    - The original author (@yakito_ri) must be attributed
**/

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../external/solidity-examples/contracts/lzApp/NonblockingLzApp.sol";

import "../external/solidity-examples/contracts//interfaces/IStargateRouter.sol";
import "../interfaces/IYakisoba.sol";
import "../interfaces/IBridgeConnectorHome.sol";

interface IStargateReceiver {
	function sgReceive(
		uint16 _chainId,
		bytes memory _srcAddress,
		uint256 _nonce,
		address _token,
		uint256 amountLD,
		bytes memory payload
	) external;
}

contract BridgeConnectorHomeSTG is
	Ownable,
	NonblockingLzApp,
	IStargateReceiver,
	IBridgeConnectorHome
{
	using SafeERC20 for IERC20;

	mapping(uint256 => uint16) public lzChainIdMap;
	mapping(uint256 => uint256) public dstPoolIdMap;
	mapping(uint256 => address) public allocatorsMap;

	mapping(uint16 => uint256) public convertLzChainId;
	mapping(uint256 => uint256) public updateRequests;

	address public immutable stgEndpoint;
	address public immutable yakisoba;
	address public immutable asset;

	uint256 public immutable srcPoolId;

	event BridgeSuccess(
		uint256 amount,
		uint256 chainId,
		uint256 fees,
		address indexed destination
	);

	event RequestReceived(uint256 chainId, uint256 amount);

	error PoolNotSet(uint256 chainId);

	error NotAuthorized();

	constructor(
		address _yakisoba,
		address _asset,
		address _stgEndpoint,
		address _lzEndpoint,
		uint256 _srcPoolId,
		uint16 homeLzChainId
	) NonblockingLzApp(_lzEndpoint) {
		yakisoba = _yakisoba;
		asset = _asset;
		stgEndpoint = _stgEndpoint;
		srcPoolId = _srcPoolId;
		convertLzChainId[homeLzChainId] = block.chainid;
		_giveAllowances(_stgEndpoint, _asset);
	}

	modifier onlyYakisoba() {
		if (msg.sender != yakisoba) revert NotAuthorized();
		_;
	}

	modifier onlyBridge() {
		if (msg.sender != stgEndpoint) revert NotAuthorized();
		_;
	}

	function _nonblockingLzReceive(
		uint16 _srcChainId,
		bytes memory _srcAddress,
		uint64 _nonce,
		bytes memory _payload
	) internal override {
		// LZApp already does the check for trusted remote lookup l28 LzApp.sol)
		uint256 amount = abi.decode(_payload, (uint256));
		uint256 chainId = convertLzChainId[_srcChainId];
		updateRequests[chainId] = amount;
		emit RequestReceived(chainId, amount);
	}

	/// @notice Use the last cross-chain message received to update the yakisoba
	/// @dev Check if the data is coherent with the remote chain before triggering it
	/// @param _chainId Chain Id to use
	function updateYakisoba(uint256 _chainId) external onlyOwner {
		IYakisoba(yakisoba).updateChainDebt(_chainId, updateRequests[_chainId]);
	}

	// TODO: Remove event
	event sgReceived(uint256 amountLD, uint256 chainId);
	/// @notice Receive tokens and data from Stargate
	function sgReceive(
		uint16 _chainId,
		bytes memory _srcAddress,
		uint256 _nonce,
		address _token,
		uint256 amountLD,
		bytes memory payload
	) external override onlyBridge {
		emit sgReceived(amountLD, _chainId);
		IYakisoba(yakisoba).receiveBridgedFunds(convertLzChainId[_chainId], amountLD);
	}

	/// @notice Send funds from yakisoba to the remote chain
	function bridgeFunds(
		uint256 _amount,
		uint256 _chainId,
		uint256 _minAmount,
		bytes calldata _bridgeData
	) external payable override onlyYakisoba {
		// Loading this in memory for gas savings
		// We send directly to the allocator
		address destination = allocatorsMap[_chainId];
		uint256 dstPoolId = dstPoolIdMap[_chainId];
		if (dstPoolId == 0) {
			revert PoolNotSet(_chainId);
		}

		// Bridging using Stargate
		IStargateRouter(stgEndpoint).swap{ value: msg.value }(
			lzChainIdMap[_chainId], // destination chain Id
			srcPoolId, // local pool Id (ex: USDC is 1)
			dstPoolIdMap[_chainId], // remote pool Id
			payable(tx.origin), // refund address for extra gas
			_amount, // quantity to swap
			_minAmount, // the min qty you would accept on the destination
			IStargateRouter.lzTxObj(0, 0, bytes("")), // params for gas forwarding
			abi.encodePacked(destination), // receiver of the tokens
			bytes("") // data for the destination router
		);
		emit BridgeSuccess(_amount, _chainId, msg.value, destination);
	}

	/// @notice Send back to the yakisoba any assets that got stuck
	/// @dev No token should stay on the connector
	function returnTokens() external onlyOwner {
		IERC20 _asset = IERC20(asset);
		_asset.transfer(yakisoba, _asset.balanceOf(address(this)));
	}

	/// @notice Add a new chain to the bridge
	/// @dev This is called from the yakisoba
	/// @param _chainId chain Id
	/// @param _allocator Remote allocator where we'll send tokens to
	/// @param _remoteConnector Remote connector from which we'll receive the data/tokens
	/// @param _params Bridge-specific params - here, layer zero stuff
	function addChain(
		uint256 _chainId,
		address _allocator,
		address _remoteConnector,
		bytes calldata _params
	) external onlyYakisoba {
		(uint16 lzChainId, uint256 dstPoolId) = abi.decode(
			_params,
			(uint16, uint256)
		);
		lzChainIdMap[_chainId] = lzChainId;
		convertLzChainId[lzChainId] = _chainId;
		dstPoolIdMap[_chainId] = dstPoolId;
		trustedRemoteLookup[lzChainId] = abi.encodePacked(
			_remoteConnector,
			address(this)
		);
		allocatorsMap[_chainId] = _allocator;
		emit SetTrustedRemote(lzChainId, trustedRemoteLookup[lzChainId]);
	}

	/// @notice Estimate the cross-chain messaging cost to bridge tokens
	/// @dev The return value is in native coin e.g eth or bnb
	/// @param _chainId Chain Id
	/// @param _amount Amount to send
	/// @return gasEstimation amount of native to send in order to bridge
	function estimateBridgeCost(
		uint256 _chainId,
		uint256 _amount
	) external view returns (uint256 gasEstimation) {
		(gasEstimation, ) = IStargateRouter(stgEndpoint).quoteLayerZeroFee(
			lzChainIdMap[_chainId], // chain ID
			1, // SWAP_REMOTE function type
			abi.encode(trustedRemoteLookup[lzChainIdMap[_chainId]]), // idem
			bytes(""), // idem
			IStargateRouter.lzTxObj(0, 0, bytes(""))
		);
	}

	/// @notice Recover native tokens sent to this contract
	function recoverNative() external onlyOwner {
		payable(msg.sender).transfer(address(this).balance);
	}

	function _giveAllowances(address _stgEndpoint, address _asset) internal {
		IERC20(_asset).safeIncreaseAllowance(_stgEndpoint, type(uint256).max);
		IERC20(_asset).safeIncreaseAllowance(yakisoba, type(uint256).max);
	}

	receive() external payable {}
}
