// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

interface ICandideWallet {
    function executeIntent(
        bytes32 orderId,
        uint256 sourceChainId,
        bytes calldata originData,
        bytes calldata proof
    ) external;

    function approvedSettlers(uint256 chainId, address settler) external view returns (bool);

    function owners(address owner) external view returns (bool);
}

contract MockSettler {
    event IntentExecuted(bytes32 indexed orderId);

    function executeIntent(
        address wallet,
        bytes32 orderId,
        uint256 sourceChainId,
        bytes calldata originData
    ) external {
        // Verify settler is approved and authorized
        ICandideWallet candideWallet = ICandideWallet(wallet);
        require(
            candideWallet.approvedSettlers(sourceChainId, address(this)),
            "Settler not approved for chain"
        );
        require(candideWallet.owners(address(this)), "Settler not authorized");

        // Execute the intent
        candideWallet.executeIntent(
            orderId,
            sourceChainId,
            originData,
            "" // empty proof for testing
        );

        emit IntentExecuted(orderId);
    }
}
