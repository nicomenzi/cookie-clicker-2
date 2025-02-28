// src/constants/blockchain.js
export const MONAD_TESTNET = {
  chainId: "0x279F", // 10143 in hex
  chainName: "Monad Testnet",
  nativeCurrency: {
    name: "MON",
    symbol: "MON",
    decimals: 18,
  },
  // Primary RPC URL with high request limit
  rpcUrls: [
    "https://testnet-rpc.monad.xyz/" // Primary RPC with 10 req/sec limit
  ],
  blockExplorerUrls: ["https://testnet.monadexplorer.com/"],
};