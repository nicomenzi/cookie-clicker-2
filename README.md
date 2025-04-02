# Blockchain Cookie Clicker

A decentralized cookie clicker game built on the Monad blockchain where each click is verified on-chain and rewards players with $COOKIE tokens.

![Blockchain Cookie Clicker](https://cookie-clicker-monad.vercel.app/)

## 🍪 Overview

Blockchain Cookie Clicker is a Web3 reimagining of the classic cookie clicker game. Players click on a cookie to earn points, which can be redeemed for $COOKIE tokens on the Monad blockchain. Each click is recorded as a blockchain transaction, making this a fully decentralized gaming experience with verifiable actions and rewards.

## ✨ Features

- **On-Chain Clicks**: Every click is recorded as a transaction on the Monad blockchain
- **Token Rewards**: Earn $COOKIE tokens by accumulating clicks
- **Persistent Gas Wallet**: Automated gas wallet creation that persists between sessions
- **Transaction Management**: Queueing, rate limiting, and status tracking of all blockchain interactions
- **Optimized API Usage**: Smart rate limiting to respect Monad testnet constraints (10 req/sec)
- **Error Resilience**: Comprehensive error handling and recovery mechanisms

## 🚀 Getting Started

### Prerequisites

- Node.js (v14+)
- Metamask or other Web3 wallet connected to Monad Testnet
- Some MON tokens for gas (testnet)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/blockchain-cookie-clicker.git
   cd blockchain-cookie-clicker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

4. Open your browser and navigate to `http://localhost:3000`

## 🔧 Configuration

The application uses the following configuration files:

- `src/constants/blockchain.js`: Contains blockchain network configuration
- `src/constants/contracts.js`: Contains contract addresses and ABIs

### Contract Addresses (Monad Testnet)

- $COOKIE Token: `0x8e378075aF71d3232be905433d612C96E38726DB`
- Cookie Clicker: `0xC133d1082457587929951bA9a20bc529577B7a0e`

## 📱 Usage

1. **Connect Wallet**: Click the "Connect Wallet" button to connect your Web3 wallet
2. **Fund Gas Wallet**: Fund your persistent gas wallet with MON tokens for automatic transactions
3. **Click the Cookie**: Each click earns you points and is recorded on the blockchain
4. **Redeem Tokens**: Exchange your points for $COOKIE tokens once you have enough

## 🧱 Architecture

The application is built using a modern React architecture with the following key components:

### Frontend
- React with Context API for state management
- Tailwind CSS for styling

### State Management
- `WalletContext`: Manages wallet connections and balances
- `GameContext`: Manages game state, score, and token balances
- `TransactionContext`: Manages transaction queue and history

### Services
- `ApiManager`: Handles API rate limiting, request queueing, and caching
- `ContractService`: Handles blockchain contract interactions
- `TransactionService`: Manages transaction creation and monitoring
- `WalletService`: Handles wallet connections and management

## 🚦 Rate Limiting

The application implements a sophisticated rate limiting system to respect Monad testnet constraints:
- 9 req/sec for transactions
- 1 req/sec for data updates
- Intelligent queueing and prioritization of requests
- Automatic retry mechanism with exponential backoff

## 🛡️ Security Features

- Deterministic wallet generation for gas efficiency
- Content Security Policy implementation
- Comprehensive error handling and boundary protection
- Transaction validation and verification

## 🔄 Transaction Processing

The application uses a streamlined transaction flow:
1. User action triggers transaction creation
2. Transaction is added to prioritized queue
3. ApiManager processes transactions respecting rate limits
4. Confirmation and status updates are displayed in real-time

## 🧪 Testing

Run tests with:
```bash
npm test
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgements

- Monad Blockchain team for testnet access
- Alchemy for providing reliable API endpoints
- ethers.js for blockchain interaction