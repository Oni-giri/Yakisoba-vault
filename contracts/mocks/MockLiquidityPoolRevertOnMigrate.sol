// SPDX-License-Identifier: GPL-3.0-or-later


pragma solidity ^0.8.17;

contract MockLiquidityPoolRevertOnMigrate {
	bool failOnMigrate;

	function migrate() external {
		if (failOnMigrate) revert();
	}

	function setFailOnMigrate(bool _failOnMigrate) external {
		failOnMigrate = _failOnMigrate;
	}

	function addLiquidity(
		uint256 amount,
		uint256 deadline
	) external returns (uint256) {
		// do nothing
	}

	function getAssetBalance() external view returns (uint256) {
		return 0;
	}
}
