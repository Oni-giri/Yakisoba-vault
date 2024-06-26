// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IBeetRewarder {
    function rewardToken() external view returns (address);
    function pendingToken(uint256 _pid, address _user) external view returns (uint256);
}