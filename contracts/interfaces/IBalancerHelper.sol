// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IBalancerHelper {
  struct JoinPoolRequest {
    address[] assets;
    uint256[] maxAmountsIn;
    bytes userData;
    bool fromInternalBalance;
  }

  struct ExitPoolRequest {
    address[] assets;
    uint256[] minAmountsOut;
    bytes userData;
    bool toInternalBalance;
  }

  function queryJoin(
    bytes32 poolId,
    address sender,
    address recipient,
    JoinPoolRequest memory request
  ) external returns (uint256 bptOut, uint256[] memory amountsIn);

  function queryExit(
    bytes32 poolId,
    address sender,
    address recipient,
    ExitPoolRequest memory request
  ) external returns (uint256 bptIn, uint256[] memory amountsOut);
}
