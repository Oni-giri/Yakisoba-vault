// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "./IStargatePool.sol";

interface IStargateFactory {
    function getPool(uint256 _srcPoolId) external returns (IStargatePool);
}
