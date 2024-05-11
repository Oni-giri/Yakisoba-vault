// SPDX-License-Identifier: GPL-3.0-or-later


pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockVaultLogic {
  using SafeERC20 for ERC20;
  address public asset;
  address public logic;

  constructor(address _asset, address _logic) {
    asset = _asset;
    logic = _logic;
  }

  event DebugMW(uint256 amount, string msg);
  event DebugMWAdd(address _address, string msg);

  function withdraw(uint256 _debtToRecover) external returns (uint256 debtToRecover) {
    emit DebugMW(_debtToRecover, "amount");
    emit DebugMW(ERC20(asset).balanceOf(address(this)), "balance");
    ERC20(asset).transfer(logic, _debtToRecover);
    debtToRecover = _debtToRecover;
  }

  function deposit(uint256 _amount) external returns (uint256) {
    require(ERC20(asset).allowance(logic, address(this)) > _amount, "not enough");
    ERC20(asset).transferFrom(logic, address(this), _amount);
    emit DebugMW(1, "Done");
    return(_amount);
  }

}
