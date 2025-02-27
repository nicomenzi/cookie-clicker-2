// src/constants/blockchain.js
export const MONAD_TESTNET = {
  chainId: "0x279F", // 10143 in hex
  chainName: "Monad Testnet",
  nativeCurrency: {
    name: "MON",
    symbol: "MON",
    decimals: 18,
  },
  // Both RPC URLs available for fast fallback
  rpcUrls: [
    "https://monad-testnet.g.alchemy.com/v2/488IcywoV_kXnNsIorSEew1H3e2AujuY" // Alchemy as backup
  ],
  blockExplorerUrls: ["https://testnet.monadexplorer.com/"],
};