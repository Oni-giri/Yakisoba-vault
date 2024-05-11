// SPDX-License-Identifier: GPL-3.0-or-later


pragma solidity ^0.8.17;

/// @dev This contract is here to help streamline pipeline creation
///  @dev A standard pipeline should implement all functions
/// @title Pipeline
abstract contract Pipeline {
    event chargedFees(uint256 amount);
    event rewardsProgramChanged(bool activated);
    event Compound(uint256 newDebt, uint256 block);

    /// @dev Deposit assets to the targeted protocol
    /// @param _amount Amount deposited
    /// @return Returns the amount deposited, minus eventual deposit fees or slippage
    function _deposit(uint256 _amount) internal virtual returns (uint256);

    // TODO: Update this abstract
    /// @dev Harvest eventual rewards, swap them and deposit assets that are in the contract
    /// @param _harvest Do we harvest?
    function _harvestCompound(bool _harvest) internal virtual;

    /// @dev Amount available in pool
    /// @dev You should check how much is recoverable from the pool, not how much was sent to it
    function _investedInPool() internal view virtual returns (uint256);

    /// @dev Amount of rewards ready to claim
    function _rewardsAvailable() internal view virtual returns (uint256);

    /// @dev Give unlimited allowance to the targeted protocol
    /// @dev Saves gas fees
    function _giveAllowances() internal virtual;

    /// @dev Remove unlimited allowance
    /// @dev This will prevent deposits
    function _removeAllowances() internal virtual;

    /// @dev Swap rewards for the underlying asset
    function _swapRewards() internal virtual;

    function _liquidate(
        uint256 _amount,
        uint256 _maxSlippage,
        bool _panic
    ) internal virtual returns (uint256 assetsRecovered);
}
