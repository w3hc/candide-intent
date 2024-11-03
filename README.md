# Candide Intent

A smart contract implementation of [ERC-7683: Cross Chain Intents Standard](https://ethereum-magicians.org/t/erc-cross-chain-intents-standard/19619), enabling secure cross-chain transactions. This implementation is inspired by and adapted from [Candide Labs' CandideWallet contract](https://github.com/candidelabs/candide-contracts/blob/main/contracts/candideWallet/CandideWallet.sol).

## About ERC-7683

ERC-7683 is a proposed standard for cross-chain intents that aims to unify how different protocols handle cross-chain transactions. Developed collaboratively by Across and Uniswap Labs, the standard:

- Enables sharing of infrastructure, filler networks, and orders across cross-chain bridging and trading systems
- Provides a unified framework for intent-based systems to specify cross-chain actions
- Allows users to express desired outcomes without worrying about the underlying mechanics
- Supports both gasless and onchain cross-chain orders
- Creates a more efficient and competitive market for cross-chain transactions

## Credit

This implementation builds upon the work of [Candide Labs](https://github.com/candidelabs), specifically their CandideWallet smart contract implementation. The base wallet functionality has been extended to support ERC-7683's cross-chain intent standard while maintaining the security features of the original contract.

## Key Components

The project combines:
- Account abstraction capabilities from Candide's wallet implementation
- ERC-7683's cross-chain intent standard
- Custom settlement logic for cross-chain transactions

## Install

```bash
pnpm install
```

Create environment file:
```bash
cp .env.template .env
```

## Test

```bash
pnpm test
```

## Deploy

```bash
pnpm deploy:sepolia      # Sepolia testnet
pnpm deploy:optimism     # Optimism mainnet
pnpm deploy:op-sepolia   # Optimism Sepolia
```

## Networks

- [OP Mainnet](https://chainlist.org/chain/10)
- [Sepolia Testnet](https://chainlist.org/chain/11155111)
- [OP Sepolia Testnet](https://chainlist.org/chain/11155420)

## Development

```bash
pnpm prettier            # Format code
pnpm compile            # Compile contracts
```

## Project Structure

- `contracts/`: Smart contract implementations
  - `CandideIntentWallet.sol`: Main contract implementing ERC-7683 and Candide's wallet features
  - `mocks/`: Test helper contracts
- `test/`: Contract test suite
- `scripts/`: Deployment and utility scripts

## Dependencies

- Node v20.9.0
- PNPM v9.12.2
- Hardhat v2.19.4
- OpenZeppelin v5.0.1
- Ethers v6.10.0
- Account Abstraction Contracts v0.7.0

## License

GPL-3.0

## Support

You can contact me via [Element](https://matrix.to/#/@julienbrg:matrix.org), [Farcaster](https://warpcast.com/julien-), [Telegram](https://t.me/julienbrg), [Twitter](https://twitter.com/julienbrg), [Discord](https://discordapp.com/users/julienbrg), or [LinkedIn](https://www.linkedin.com/in/julienberanger/).