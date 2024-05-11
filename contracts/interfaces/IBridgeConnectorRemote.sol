// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IBridgeConnectorRemote {
	function bridgeFunds(uint256 _amount, uint256 _minAmount) external payable;

	function estimateBridgeCost()
		external
		view
		returns (uint256 _messagingCost);

	function updateChainDebt(
		uint256 _chainId,
		uint256 _totalChainDebt
	) external payable;
}
