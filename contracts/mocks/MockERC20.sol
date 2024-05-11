// SPDX-License-Identifier: GPL-3.0-or-later
/**
    Note for the non-lawyers: The licence says that, if you fork:
    - The source code is made available to the public in source code form under the same license
    - The original author (@yakito_ri) must be attributed
**/

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
	constructor(
		string memory name,
		string memory symbol,
		uint256 supply
	) ERC20(name, symbol) {
		_mint(msg.sender, supply);
	}

	function mint(address account, uint256 amount) external {
		_mint(account, amount);
	}

	function burn(address account, uint256 amount) external {
		_burn(account, amount);
	}
}
