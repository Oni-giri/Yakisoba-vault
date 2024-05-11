// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IBridgeRouter {
    function bridgeRequest(uint256 _amount, uint256 _chainId)
        external
        returns (bool success);

    function bridgeFunds(uint256 _chainId) external payable;

    function addChain(
        uint16 _lzChainId,
        uint256 _chainId,
        uint256 _dstPoolId,
        address _remoteRouter
    ) external;

    function estimateGasFee(uint256 _chainId, uint256 _amount)
        external
        returns (uint256 gasEstimation);
}
