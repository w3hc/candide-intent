// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

/// @title CandideIntentWallet
/// @author Candide Labs (modified from CandideWallet)
/// @notice A smart contract wallet implementing ERC-7683 cross-chain intents standard
/// @dev Implements both standard wallet functionality and cross-chain intent creation/execution
contract CandideIntentWallet {
    using ECDSA for bytes32;

    /// @notice The entry point contract for ERC-4337 account abstraction
    address public entryPoint;

    /// @notice Mapping of addresses to their owner status
    /// @dev True if the address is an owner of this wallet
    mapping(address => bool) public owners;

    /// @notice Number of required confirmations for operations
    /// @dev Currently unused in single-owner configuration
    uint256 public threshold;

    /// @notice Mapping of executed intents to prevent replay
    /// @dev orderId => executed status
    mapping(bytes32 => bool) public executedIntents;

    /// @notice Mapping of approved settler contracts per chain
    /// @dev chainId => settler address => approval status
    mapping(uint256 => mapping(address => bool)) public approvedSettlers;

    /// @notice Emitted when a new owner is added to the wallet
    /// @param owner Address of the newly added owner
    event OwnerAdded(address indexed owner);

    /// @notice Emitted when the confirmation threshold is changed
    /// @param threshold New threshold value
    event ThresholdChanged(uint256 threshold);

    /// @notice Emitted when the wallet is initially set up
    /// @param owners Array of initial owner addresses
    /// @param threshold Initial confirmation threshold
    event WalletSetup(address[] owners, uint256 threshold);

    /// @notice Emitted when a new cross-chain intent is created
    /// @param orderId Unique identifier for the intent
    /// @param token Address of the token being transferred
    /// @param amount Amount of tokens being transferred
    /// @param target Address of the settler contract
    event IntentCreated(bytes32 indexed orderId, address token, uint256 amount, address target);

    /// @notice Emitted when a cross-chain intent is executed
    /// @param orderId Unique identifier of the executed intent
    /// @param target Address of the contract called during execution
    /// @param data Calldata executed on the target contract
    event IntentExecuted(bytes32 indexed orderId, address target, bytes data);

    /// @notice Emitted when a token approval is set
    /// @param token Address of the approved token
    /// @param spender Address approved to spend tokens
    /// @param amount Amount approved to spend
    event TokenApproved(address token, address spender, uint256 amount);

    /// @notice Emitted when a settler's approval status changes
    /// @param chainId Chain ID for which the settler is approved/disapproved
    /// @param settler Address of the settler contract
    /// @param approved New approval status
    event SettlerApproved(uint256 chainId, address settler, bool approved);

    /// @notice Operation types supported by the wallet
    /// @dev Currently supports regular calls and delegate calls
    enum Operation {
        Call,
        DelegateCall
    }

    /// @notice Ensures only authorized addresses can call certain functions
    modifier authorized() {
        require(owners[msg.sender], "Not authorized");
        _;
    }

    /// @notice Initializes the wallet with an entry point contract
    /// @param _entryPoint Address of the ERC-4337 entry point contract
    /// @dev The entry point is immutable after deployment
    constructor(address _entryPoint) {
        require(_entryPoint != address(0), "Invalid entrypoint");
        entryPoint = _entryPoint;
    }

    /// @notice Sets up the wallet with initial owners and threshold
    /// @param _owners Array of initial owner addresses
    /// @param _threshold Number of required confirmations
    /// @dev Can only be called once during initialization
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

    /// @notice Creates a new cross-chain intent
    /// @param destinationChainId ID of the destination chain
    /// @param token Address of the token to be transferred
    /// @param amount Amount of tokens to transfer
    /// @param target Address of the settler contract
    /// @param callData Additional data for the intent execution
    /// @dev Implements ERC-7683 intent creation
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

    /// @notice Executes a cross-chain intent
    /// @param orderId Unique identifier of the intent
    /// @param sourceChainId Chain ID where the intent originated
    /// @param originData Data from the origin chain needed for execution
    /// @dev Implements ERC-7683 intent execution
    function executeIntent(
        bytes32 orderId,
        uint256 sourceChainId,
        bytes calldata originData,
        bytes calldata /* proof */
    ) external {
        require(!executedIntents[orderId], "Intent already executed");
        require(approvedSettlers[sourceChainId][msg.sender], "Settler not approved for chain");

        (address targetAddress, bytes memory targetCallData) = abi.decode(
            originData,
            (address, bytes)
        );

        bool success = execute(targetAddress, 0, targetCallData);
        require(success, "Execution failed");

        executedIntents[orderId] = true;
        emit IntentExecuted(orderId, targetAddress, targetCallData);
    }

    /// @notice Internal function to execute contract calls
    /// @param target Address of the contract to call
    /// @param value Amount of ETH to send
    /// @param data Calldata to execute
    /// @return success Whether the execution was successful
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

    /// @notice Sets approval status for a settler contract on a specific chain
    /// @param chainId ID of the chain for which to set approval
    /// @param settler Address of the settler contract
    /// @param approved New approval status
    /// @dev Only callable by authorized addresses
    function setSettlerApproval(
        uint256 chainId,
        address settler,
        bool approved
    ) external authorized {
        require(settler != address(0), "Invalid settler");
        approvedSettlers[chainId][settler] = approved;
        emit SettlerApproved(chainId, settler, approved);
    }

    /// @notice Adds a new owner to the wallet
    /// @param owner Address of the new owner
    /// @dev Only callable by authorized addresses
    function addOwner(address owner) external authorized {
        require(owner != address(0), "Invalid owner");
        require(!owners[owner], "Already owner");
        owners[owner] = true;
        emit OwnerAdded(owner);
    }

    /// @notice Allows the wallet to receive ETH
    receive() external payable {}

    /// @notice Fallback function to support receiving ETH
    fallback() external payable {}
}
