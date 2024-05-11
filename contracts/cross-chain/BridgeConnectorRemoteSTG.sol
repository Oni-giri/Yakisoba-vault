// SPDX-License-Identifier: GPL-3.0-or-later
/**
    Note for the non-lawyers: The licence says that, if you fork:
    - The source code is made available to the public in source code form under the same license
    - The original author (@yakito_ri) must be attributed
**/

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../external/solidity-examples/contracts/interfaces/ILayerZeroEndpoint.sol";
import "../external/solidity-examples/contracts//interfaces/IStargateRouter.sol";
import "../interfaces/IBridgeConnectorRemote.sol";

contract BridgeConnectorRemoteSTG is Ownable {
	// We set immutables in capital character
	address public immutable asset;
	uint16 public immutable homeChainId; // Layer zero chain id
	uint256 public dstPoolId;
	uint256 public srcPoolId;
	uint256 public brigeGasAmount;
	uint256 public updateGasAmount;

	address public allocator;
	address public homeBridge;

	IStargateRouter public immutable stgRouter;
	ILayerZeroEndpoint public layerZeroEndpoint;

	error NotAuthorized();
	error AllocatorAlreadySet();

	constructor(
		address _asset,
		uint16 _homeChainId, // Layer zero chain id
		address _homeBridge,
		uint256 _dstPoolId,
		uint256 _srcPoolId,
		address _stgRouter,
		address _lzEndpoint,
		uint256 _bridgeGasAmount,
		uint256 _updateGasAmount
	) {
		asset = _asset;
		homeChainId = _homeChainId;
		homeBridge = _homeBridge;
		dstPoolId = _dstPoolId;
		srcPoolId = _srcPoolId;
		stgRouter = IStargateRouter(_stgRouter);
		layerZeroEndpoint = ILayerZeroEndpoint(_lzEndpoint);
		brigeGasAmount = _bridgeGasAmount;
		updateGasAmount = _updateGasAmount;

		IERC20(_asset).approve(address(_stgRouter), 2 ** 256 - 1);
	}

	/// @notice Modifier to check if the caller is the allocator contract
	modifier onlyAllocator() {
		if (msg.sender != allocator) revert NotAuthorized();
		_;
	}

	/// @notice Send funds to the home chain
	/// @param _amount Amount of funds to send
	/// @param _minAmount Minimum amount of funds to receive on the home chain
	function bridgeFunds(
		uint256 _amount,
		uint256 _minAmount
	) external payable onlyAllocator {
		stgRouter.swap{ value: msg.value }(
			homeChainId, // destination chain Id
			srcPoolId, // local pool Id (ex: USDC is 1)
			dstPoolId, // remote pool Id
			payable(tx.origin), // refund address for extra gas
			_amount, // quantity to swap
			_minAmount, // the min qty you would accept on the destination
			IStargateRouter.lzTxObj(
				brigeGasAmount,
				0,
				abi.encodePacked(msg.sender)
			), // params for gas forwarding
			abi.encodePacked(homeBridge), // receiver of the tokens
			bytes("Astrolab") // data for the destination router
		);
	}

	/// @notice send a message to the home chain to update the debt of the remote chain
	/// @param _chainId This parameter is unused, for future use
	/// @param _amount Amount of debt to update
	function updateChainDebt(
		uint256 _chainId,
		uint256 _amount
	) external payable onlyAllocator {
		ILayerZeroEndpoint(layerZeroEndpoint).send{ value: msg.value }(
			homeChainId, // _dstChainId
			abi.encodePacked(homeBridge, address(this)), // _destination
			abi.encode(_amount), // _payload
			payable(tx.origin), // _refundAddress
			address(0x0),
			abi.encodePacked(uint16(1), updateGasAmount, uint256(0), homeBridge) // adapterParams
		);
	}

	/// @notice Estimate STG cost of sending a message
	/// @return cost Cost estimate (in wei)
	function estimateBridgeCost() external view returns (uint256 cost) {
		IStargateRouter.lzTxObj memory _lzParams = IStargateRouter.lzTxObj(
			brigeGasAmount,
			0,
			abi.encodePacked(address(this))
		); // remote router

		(cost, ) = stgRouter.quoteLayerZeroFee(
			homeChainId, // chain ID
			1, // SWAP_REMOTE function type
			abi.encodePacked(homeBridge), // idem bytes
			bytes("Astrolab"), // idem
			_lzParams
		);
	}

	/// @notice Estimate native cost of sending a message
	function estimateUpdateCost() external view returns (uint256 cost) {
		(cost, ) = ILayerZeroEndpoint(layerZeroEndpoint).estimateFees(
			homeChainId,
			homeBridge,
			abi.encode(type(uint256).max),
			false,
			abi.encodePacked(uint16(1), updateGasAmount)
		);
	}

	/// @notice Recover native tokens sent to this contract
	function recoverNative() external onlyOwner {
		payable(msg.sender).transfer(address(this).balance);
	}

	/// @notice Set the allocator contract
	/// @param _allocator Allocator contract address
	function setAllocator(address _allocator) external onlyOwner {
		// We can't change it after it's set
		if (allocator != address(0)) revert AllocatorAlreadySet();
		allocator = _allocator;
	}

	function setUpdateGasCost(uint256 _updateGasAmount) external onlyOwner {
		updateGasAmount = _updateGasAmount;
	}
}
