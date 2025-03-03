// src/constants/blockchain.js
export const MONAD_TESTNET = {
  chainId: "0x279F", // 10143 in hex
  chainName: "Monad Testnet",
  nativeCurrency: {
    name: "MON",
    symbol: "MON",
    decimals: 18,
  },
  // Updated to use the requested RPC URL
  rpcUrls: [
    "https://testnet-rpc.monad.xyz/",
  ],
  blockExplorerUrls: ["https://testnet.monadexplorer.com/"],
};