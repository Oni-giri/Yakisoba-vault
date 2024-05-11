// SPDX-License-Identifier: GPL-3.0-or-later


pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../pipelines/StrategyV4.sol";

/// @dev This contract is here to help streamline pipeline creation (v4)
///  @dev A standard pipeline should implement all functions
/// @title Pipeline
contract MockPipeline is StrategyV4 {
	using SafeERC20 for IERC20;

	bool public failLiquidate;

	/// @dev This function is used to initialize the dependency with the custom values needed
	// solc-ignore-next-line unused-param
	constructor(
		// solc-ignore-next-line unused-param
		bytes memory _pipelineParam,
		uint256 _feeAmount,
		address _asset,
		address _allocator,
		address _feeRecipient
	) StrategyV4(_feeAmount, _asset, _allocator, _feeRecipient) {
		asset = _asset;
		allocator = _allocator;
		_giveAllowances();
	}

	/// @dev Pull assets from the targeted protocol
	/// @param _amount Amount to withdraw
	/// @return assetsRecovered Amount of assets recovered
	// solc-ignore-next-line unused-param
	function _liquidate(
		uint256 _amount,
		// solc-ignore-next-line unused-param
		uint256 _maxSlippage,
		bool _panic
	) internal override returns (uint256 assetsRecovered) {
		if(failLiquidate) {
			revert();
		}
		uint256 vaultBalance = IERC20(asset).balanceOf(address(this));

		if (vaultBalance < _amount) {
			_amount = vaultBalance;
		}

		// Using msg.sender saves gas
		IERC20(asset).safeTransfer(msg.sender, _amount);
		return (_amount);
	}

	function setFailLiquidate(bool _failLiquidate) external {
		failLiquidate = _failLiquidate;
	}

	/// @dev Harvest eventual rewards, swap them and deposit assets that are in the contract
	/// @param _harvest Do we harvest?
	// solc-ignore-next-line unused-param
	function _harvestCompound(bool _harvest) internal override {
		emit Compound(IERC20(asset).balanceOf(address(this)), block.timestamp);
	}

	/// @dev Amount available in pool
	/// @dev You should check how much is recoverable from the pool, not how much was sent to it
	function _investedInPool() internal view override returns (uint256) {
		return 0;
	}

	/// @dev Amount of rewards ready to claim
	function _rewardsAvailable() internal view override returns (uint256) {
		return (0);
	}

	/// @dev Give unlimited allowance to the targeted protocol
	/// @dev Saves gas fees
	function _giveAllowances() internal override {
		IERC20(asset).approve(allocator, MAX_INT);
		return;
	}

	/// @dev Remove unlimited allowance
	/// @dev This will prevent deposits
	function _removeAllowances() internal override {
		return;
	}

	/// @dev Send fees to the recipient
	// solc-ignore-next-line unused-param
	function _chargeFees(address _feeRecipient) internal override {
		return;
	}

	/// @dev Swap rewards for the underlying asset
	function _swapRewards() internal override {
		return;
	}

	receive() external payable {}
}
