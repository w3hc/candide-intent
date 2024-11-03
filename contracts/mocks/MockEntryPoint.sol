// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

contract MockEntryPoint {
    mapping(address => uint256) public nonces;

    function getNonce(address sender, uint192) external view returns (uint256) {
        return nonces[sender];
    }
}
