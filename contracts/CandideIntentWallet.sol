// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

contract CandideIntentWallet {
    using ECDSA for bytes32;

    address public entryPoint;
    mapping(address => bool) public owners;
    uint256 public threshold;
    mapping(bytes32 => bool) public executedIntents;
    mapping(uint256 => mapping(address => bool)) public approvedSettlers;

    event OwnerAdded(address indexed owner);
    event ThresholdChanged(uint256 threshold);
    event WalletSetup(address[] owners, uint256 threshold);
    event IntentCreated(bytes32 indexed orderId, address token, uint256 amount, address target);
    event IntentExecuted(bytes32 indexed orderId, address target, bytes data);
    event TokenApproved(address token, address spender, uint256 amount);
    event SettlerApproved(uint256 chainId, address settler, bool approved);

    enum Operation {
        Call,
        DelegateCall
    }

    modifier authorized() {
        require(owners[msg.sender], "Not authorized");
        _;
    }

    constructor(address _entryPoint) {
        require(_entryPoint != address(0), "Invalid entrypoint");
        entryPoint = _entryPoint;
    }

    function setup(address[] calldata _owners, uint256 _threshold) external {
        require(_threshold > 0 && _threshold <= _owners.length, "Invalid threshold");
        require(threshold == 0, "Already initialized");

        threshold = _threshold;
        for (uint i = 0; i < _owners.length; i++) {
            require(_owners[i] != address(0), "Invalid owner");
            require(!owners[_owners[i]], "Duplicate owner");
            owners[_owners[i]] = true;
            emit OwnerAdded(_owners[i]);
        }

        emit ThresholdChanged(_threshold);
        emit WalletSetup(_owners, _threshold);
    }

    function createIntent(
        uint256 destinationChainId,
        address token,
        uint256 amount,
        address target,
        bytes calldata callData
    ) external authorized {
        require(token != address(0), "Invalid token");
        require(target != address(0), "Invalid target");
        require(amount > 0, "Invalid amount");
        require(approvedSettlers[destinationChainId][target], "Invalid settler");

        bytes32 orderId = keccak256(
            abi.encode(destinationChainId, token, amount, target, callData, block.timestamp)
        );

        // Approve token transfer
        IERC20(token).approve(target, amount);
        emit TokenApproved(token, target, amount);

        emit IntentCreated(orderId, token, amount, target);
    }

    function executeIntent(
        bytes32 orderId,
        uint256 sourceChainId,
        bytes calldata originData,
        bytes calldata /* proof */
    ) external {
        require(!executedIntents[orderId], "Intent already executed");
        // Change this line to check the proper chainId
        require(approvedSettlers[sourceChainId][msg.sender], "Invalid settler");

        (address targetAddress, bytes memory targetCallData) = abi.decode(
            originData,
            (address, bytes)
        );

        bool success = execute(targetAddress, 0, targetCallData);
        require(success, "Execution failed");

        executedIntents[orderId] = true;
        emit IntentExecuted(orderId, targetAddress, targetCallData);
    }

    function execute(
        address target,
        uint256 value,
        bytes memory data
    ) internal returns (bool success) {
        require(target != address(0), "Invalid target");

        // solhint-disable-next-line no-inline-assembly
        assembly {
            success := call(gas(), target, value, add(data, 0x20), mload(data), 0, 0)
        }
    }

    function setSettlerApproval(
        uint256 chainId,
        address settler,
        bool approved
    ) external authorized {
        require(settler != address(0), "Invalid settler");
        approvedSettlers[chainId][settler] = approved;
        emit SettlerApproved(chainId, settler, approved);
    }

    function addOwner(address owner) external authorized {
        require(owner != address(0), "Invalid owner");
        require(!owners[owner], "Already owner");
        owners[owner] = true;
        emit OwnerAdded(owner);
    }

    receive() external payable {}

    fallback() external payable {}
}
