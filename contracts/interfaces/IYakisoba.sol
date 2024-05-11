// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IYakisoba {
    function setRouter(address _newRouter) external;

    function depositCallback(uint256 _nonce, uint256 _amountDeposited) external;

    function withdrawCallback(
        uint256 nonce,
        uint256 _amountLD,
        uint256 amountWithdrawn
    ) external;

    function updateChainDebt(uint256 _srcChainId, uint256 _amount) external;

    function receiveBridgedFunds(uint256 _chainId, uint256 _amount) external;
}
