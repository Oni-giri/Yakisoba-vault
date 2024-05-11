// SPDX-License-Identifier: GPL-3.0-or-later
/**
    Note for the non-lawyers: The licence says that, if you fork:
    - The source code is made available to the public in source code form under the same license
    - The original author (@yakito_ri) must be attributed
**/

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./AaveV3Pipeline.sol";
import "../interfaces/IStrategy.sol";
import "../interfaces/IAllocator.sol";

/// @title Astrolab Strategy V3.0
/// @notice Manages the interaction between with the farmed protocol
/// @dev A protocol-specific "Pipeline" needs to be added as a dep
contract StrategyV3 is AaveV3Pipeline, Pausable, IStrategy, Ownable {
    using SafeERC20 for IERC20;
    using Address for address;

    event FeesUpdated(uint256 newFee);
    event RouterUpdated(address indexed newRouter);
    event feeRecipientUpdated(address indexed newFeeRecipient);
    event DebugV(uint256 amount, string msg);

    constructor(
        bytes memory _pipelineParams,
        uint256 _feeAmount,
        address _asset,
        address _allocator,
        address _feeRecipient
    )
        AaveV3Pipeline(
            _pipelineParams,
            _feeAmount,
            _asset,
            _allocator,
            _feeRecipient
        )
    {
        // TODO: check that pipelines give allowances to the allocator
    }

    modifier onlyAllocator() {
        require(msg.sender == allocator, "strategy: not router");
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
    ) external onlyOwner returns (uint256 assetsRecovered, uint256 newDebt) {
        // TODO: add slippage control
        require(
            msg.sender == owner() || msg.sender == allocator,
            "!authorized"
        );
        return (_liquidate(_amount, _maxSlippage, _panic), totalBalance());
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

    // TODO: chec where we should use this
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
    /// @notice amount of assets available and not yet deposited
    function available() public view returns (uint256) {
        return IERC20(asset).balanceOf(address(this));
    }

    /// @notice amount of reward tokens available and not yet harvested
    function rewardsAvailable() external view returns (uint256) {
        return _rewardsAvailable();
    }

    /// @notice amount of assets in the pool
    function investedInPool() public view returns (uint256) {
        return _investedInPool();
    }

    /// @notice total amount of assets available in the strategy
    function totalBalance() public view returns (uint256) {
        return IERC20(asset).balanceOf(address(this)) + investedInPool();
    }
}
