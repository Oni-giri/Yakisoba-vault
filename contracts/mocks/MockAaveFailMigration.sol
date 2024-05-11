// SPDX-License-Identifier: GPL-3.0-or-later


pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../mocks/MockERC20.sol";

contract MockAaveFailMigration {
	address public underlyingAsset;
	uint256 balance;
	uint256 maxAmount;
	bool fail;
	MockERC20 aaveToken;

	constructor(address _asset, address _aaveToken) {
		underlyingAsset = _asset;
		aaveToken = MockERC20(_aaveToken);
	}

	function deposit(
		address _token,
		uint256 _amount,
		address onBehalfOf,
		uint16 _referralCode
	) external {
		IERC20(underlyingAsset).transferFrom(
			msg.sender,
			address(this),
			_amount
		);
		aaveToken.mint(msg.sender, _amount);
	}

	function balanceOf(address) external pure returns (uint256) {
		return 0;
	}

	function setFail(bool _fail) external {
		fail = _fail;
	}

	function setMaxAmount(uint256 _maxAmount) external {
		maxAmount = _maxAmount;
	}

	function withdraw(
		address asset,
		uint256 amount,
		address to
	) external returns (uint256) {
		if (fail) {
			revert();
		}

		if (amount > maxAmount) {
			revert();
		}
		IERC20(asset).transfer(to, amount);
		aaveToken.burn(msg.sender, amount);
	}
}
