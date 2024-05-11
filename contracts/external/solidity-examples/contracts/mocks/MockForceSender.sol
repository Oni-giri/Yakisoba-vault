// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract MockForceSender {
    receive () external payable {}

    function forceSend(address payable _to) external {
        selfdestruct(_to);
    }
}