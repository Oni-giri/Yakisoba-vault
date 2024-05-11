// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../interfaces/IAllocator.sol";
import "../interfaces/utils/ISwapManager.sol";

abstract contract StrategyV4 is Pausable, Ownable {
	using SafeERC20 for IERC20;
	using Address for address;

	uint256 public constant MAX_INT = 2 ** 256 - 1;

	event Compound(uint256 newDebt, uint256 block);
	event chargedFees(uint256 amount);
	event FeesUpdated(uint256 newFee);
	event RouterUpdated(address indexed newRouter);
	event feeRecipientUpdated(address indexed newFeeRecipient);

	address public asset;
	uint256 public lastHarvest;
	uint256 public vaultDebt;

	// params
	address public allocator;
	uint256 public feeAmount; // 1 = 0.1%
	uint256 immutable feeDenom = 1000;
	address public feeRecipient;
	address public swapManager;
	ISwapManager Manager;

	error notAllocator();

	constructor(
		uint256 _feeAmount,
		address _asset,
		address _allocator,
		address _feeRecipient
	) {
		feeAmount = _feeAmount;
		asset = _asset;
		allocator = _allocator;
		feeRecipient = _feeRecipient;
	}

	modifier onlyAllocator() {
		if (msg.sender != allocator) revert notAllocator();
		_;
	}

	modifier onlyInternal() {
		require(
			msg.sender == owner() || msg.sender == allocator,
			"Strategy: caller is not owner nor allocator"
		);
		_;
	}

	/// @notice Order to unfold the strategy
	/// If we pass "panic", we ignore slippage and withdraw all
	/// @dev The call will revert if the slippage created is too high
	/// @param _amount Amount of debt to unfold
	/// @param _panic ignore slippage when unfolding
	function liquidate(
		uint256 _amount,
		uint256 _maxSlippage,
		bool _panic
	) external onlyInternal returns (uint256 assetsRecovered, uint256 newDebt) {
		// TODO: add slippage control
		return (_liquidate(_amount, _maxSlippage, _panic), totalBalance());
	}

	/// @notice Order the withdraw request in strategies with lock
	/// @param _amount Amount of debt to unfold
	/// @return assetsRecovered Amount of assets recovered
	function withdrawRequest(
		uint256 _amount
	) external onlyInternal returns (uint256) {
		return _withdrawRequest(_amount);
	}

	/// @notice Harvest, convert rewards and deposit, and update the home chain router with the new amount.
	/// @dev deposits are done during compound to save gas
	/// @param _harvest Allows the caller to specify if harvest happens - otherwise, only deposit+update
	function harvestCompoundUpdate(
		bool _harvest
	) external whenNotPaused onlyOwner {
		_harvestCompound(_harvest);
		uint256 newDebt = totalBalance();
		IAllocator(allocator).updateStrategyDebt(newDebt);
		emit Compound(newDebt, block.timestamp);
	}

	/// @notice pause deposits/harvest
	function pause() public onlyOwner {
		_pause();
		_removeAllowances();
		emit Paused(msg.sender);
	}

	/// @notice unpause deposits/harvest
	function unpause() public onlyOwner {
		_unpause();
		_giveAllowances();
		emit Unpaused(msg.sender);
	}

	/// @notice setter for fees
	/// @param _feeAmount fee, as x/1000 - 200/1000 = 20%
	// TODO: max fee amount?
	function updateFee(uint256 _feeAmount) external onlyOwner {
		feeAmount = _feeAmount;
		emit FeesUpdated(_feeAmount);
	}

	/// @notice Update Fee Recipient address
	function updateFeeRecipient(address _feeRecipient) external onlyOwner {
		require(_feeRecipient != address(0), "Address empty");
		feeRecipient = _feeRecipient;
		emit feeRecipientUpdated(feeRecipient);
	}

	/// @notice recover tokens sent by error to the contract
	/// @param _token ERC40 token address
	function inCaseTokensGetStuck(address _token) external onlyOwner {
		require(_token != address(asset), "strategy: !token");

		uint256 amount = IERC20(_token).balanceOf(address(this));
		IERC20(_token).safeTransfer(msg.sender, amount);
	}

	// Views

	/**
	 * @notice amount of assets available and not yet deposited
	 * @return amount of assets available
	 */
	function available() public view returns (uint256) {
		return IERC20(asset).balanceOf(address(this));
	}

	/**
	 * @notice amount of reward tokens available and not yet harvested
	 * @dev abstract function to be implemented by the pipeline
	 * @return amount of reward tokens available
	 */
	function rewardsAvailable() external view returns (uint256) {
		return _rewardsAvailable();
	}

	/**
	 * @notice amount of assets in the protocol farmed by the strategy
	 * @dev underlying abstract function to be implemented by the pipeline
	 * @return amount of assets in the pool
	 */
	function investedInPool() public view returns (uint256) {
		return _investedInPool();
	}

	/**
	 * @notice total amount of assets available in the strategy
	 * @dev includes assets in the pool and assets available
	 * @return total amount of assets available in the strategy
	 */
	function totalBalance() public view returns (uint256) {
		return IERC20(asset).balanceOf(address(this)) + investedInPool();
	}

	/**
	 * @notice Update the swap manager
	 * @param _swapManager address of the new swap manager
	 */
	function updateSwapManager(address _swapManager) external onlyOwner {
		require(_swapManager != address(0), "Address empty");
		swapManager = _swapManager;
		Manager = ISwapManager(swapManager);
		emit RouterUpdated(_swapManager);
	}

	/// Abstract functions to be implemented by the pipeline

	/**
	 * @notice withdraw assets from the protocol
	 * @param _amount amount of assets to withdraw
	 * @param _maxSlippage maximum slippage allowed
	 * @param _panic if true, ignore slippage
	 * @return  assetsRecovered amount of assets withdrawn
	 */
	function _liquidate(
		uint256 _amount,
		uint256 _maxSlippage,
		bool _panic
	) internal virtual returns (uint256 assetsRecovered) {}

	function _withdrawRequest(
		uint256 _amount
	) internal virtual returns (uint256) {}

	function _harvestCompound(bool _harvest) internal virtual {}

	function _investedInPool() internal view virtual returns (uint256) {}

	function _rewardsAvailable() internal view virtual returns (uint256) {}

	function _giveAllowances() internal virtual {}

	function _removeAllowances() internal virtual {}

	function _chargeFees(address _feeRecipient) internal virtual {}

	function _swapRewards() internal virtual {}
}
