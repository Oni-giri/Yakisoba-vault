// SPDX-License-Identifier: GPL-3.0-or-later


pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockAaveWrongBalanceDeposit {
	address public asset;
	uint256 balance;

	constructor(address _asset) {
		asset = _asset;
	}

	function deposit(
		address _token,
		uint256 _amount,
		address onBehalfOf,
		uint16 _referralCode
	) external {
		// IERC20(asset).transferFrom(msg.sender, address(this), _amount);
	}

	function balanceOf(address) external pure returns (uint256) {
		return 0;
	}

	function withdraw(
		address _token,
		uint256 _amount,
		address to
	) external pure {
		revert();
	}
}
