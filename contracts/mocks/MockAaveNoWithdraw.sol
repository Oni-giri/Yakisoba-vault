// SPDX-License-Identifier: GPL-3.0-or-later
/**
    Note for the non-lawyers: The licence says that, if you fork:
    - The source code is made available to the public in source code form under the same license
    - The original author (@yakito_ri) must be attributed
**/

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockAaveNoWithdraw {
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
		IERC20(asset).transferFrom(msg.sender, address(this), _amount);
	}

	function balanceOf(address) external view returns (uint256) {
		return IERC20(asset).balanceOf(address(this));
	}

	function withdraw(address _token, uint256 _amount, address to) external {
		require(false, "withdraw not implemented");
	}
}
