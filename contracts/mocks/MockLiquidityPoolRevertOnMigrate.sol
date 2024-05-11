// SPDX-License-Identifier: GPL-3.0-or-later
/**
    Note for the non-lawyers: The licence says that, if you fork:
    - The source code is made available to the public in source code form under the same license
    - The original author (@yakito_ri) must be attributed
**/

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
