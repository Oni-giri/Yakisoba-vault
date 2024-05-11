// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IStrategy {
    function pause() external;

    function unpause() external;

    function updateFee(uint256 _feeAmount) external;

    // Utils
    function inCaseTokensGetStuck(address _token) external;

    // View
    function totalBalance() external view returns (uint256);

    function available() external view returns (uint256);

    function investedInPool() external view returns (uint256);

    function rewardsAvailable() external view returns (uint256);

    function liquidate(uint256 amount, uint256 _maxSlippage, bool panic)
        external
        returns (uint256, uint256);
}
