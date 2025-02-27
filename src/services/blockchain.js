// src/services/blockchain.js
import { ethers } from 'ethers';
import { MONAD_TESTNET } from '../constants/blockchain';
import { 
  COOKIE_TOKEN_ADDRESS, 
  COOKIE_CLICKER_ADDRESS,
  COOKIE_TOKEN_ABI,
  COOKIE_CLICKER_ABI
} from '../constants/contracts';
import rateLimitedManager from './RateLimitedRequestManager';

// Contract instances cache
let clickerContract = null;
let tokenContract = null;
let contractDecimals = null;

/**
 * Connect to browser wallet (MetaMask, etc.) with enhanced security
 * @returns {Promise<{provider: ethers.providers.Web3Provider, signer: ethers.Signer, address: string}>}
 */
export const connectWallet = async () => {
  if (!window.ethereum) {
    throw new Error("No Ethereum wallet found. Please install MetaMask or similar.");
  }
  
  try {
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    
    // Check if we're on Monad network
    const network = await provider.getNetwork();
    if (network.chainId !== parseInt(MONAD_TESTNET.chainId, 16)) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: MONAD_TESTNET.chainId }],
        });
      } catch (switchError) {
        // This error code means that the chain hasn't been added to MetaMask
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [MONAD_TESTNET],
          });
        } else {
          throw switchError;
        }
      }
    }
    
    // Re-create provider after switching chains to ensure it's using the correct network
    const updatedProvider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = updatedProvider.getSigner();
    const address = await signer.getAddress();
    
    return { provider: updatedProvider, signer, address };
  } catch (error) {
    console.error("Wallet connection error:", error);
    throw new Error("Failed to connect wallet: " + (error.message || "Unknown error"));
  }
};

/**
 * Get cookie clicker contract with caching
 * @param {ethers.providers.Provider|ethers.Signer} signerOrProvider - Provider or signer
 * @returns {ethers.Contract} - The contract instance
 */
export const getCookieClickerContract = (signerOrProvider) => {
  if (!signerOrProvider) {
    throw new Error("Provider or signer is required");
  }
  
  if (!clickerContract || clickerContract.provider !== signerOrProvider) {
    clickerContract = new ethers.Contract(
      COOKIE_CLICKER_ADDRESS,
      COOKIE_CLICKER_ABI,
      signerOrProvider
    );
  }
  
  return clickerContract;
};

/**
 * Get cookie token contract with caching
 * @param {ethers.providers.Provider|ethers.Signer} signerOrProvider - Provider or signer
 * @returns {ethers.Contract} - The contract instance
 */
export const getCookieTokenContract = (signerOrProvider) => {
  if (!signerOrProvider) {
    throw new Error("Provider or signer is required");
  }
  
  if (!tokenContract || tokenContract.provider !== signerOrProvider) {
    tokenContract = new ethers.Contract(
      COOKIE_TOKEN_ADDRESS,
      COOKIE_TOKEN_ABI,
      signerOrProvider
    );
  }
  
  return tokenContract;
};

/**
 * Get token decimals with caching
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @returns {Promise<number>} - Token decimals
 */
export const getTokenDecimals = async (provider) => {
  if (contractDecimals !== null) {
    return contractDecimals;
  }
  
  return rateLimitedManager.request(
    async () => {
      const contract = getCookieTokenContract(provider);
      const decimals = await contract.decimals();
      contractDecimals = decimals;
      return decimals;
    },
    'token-decimals',
    3600000, // Cache for 1 hour - decimals don't change
    { priority: 'low' }
  );
};

/**
 * Check if the CookieClicker contract has tokens to distribute with caching
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @returns {Promise<boolean>} - True if contract has tokens
 */
export const checkContractHasTokens = async (provider) => {
  if (!provider) {
    throw new Error("Provider is required");
  }
  
  return rateLimitedManager.request(
    async () => {
      const contract = getCookieClickerContract(provider);
      const balance = await contract.getContractBalance();
      return !balance.isZero();
    },
    'contract-has-tokens',
    60000, // 1 minute cache
    { priority: 'low' }
  ).catch((error) => {
    console.warn("Error checking contract tokens:", error);
    return true; // Assume tokens are available on error
  });
};

/**
 * Get player's score with caching
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @param {string} address - Player's address
 * @returns {Promise<number>} - Player's score
 */
export const getPlayerScore = async (provider, address) => {
  if (!provider || !address) {
    throw new Error("Provider and address are required");
  }
  
  return rateLimitedManager.request(
    async () => {
      const contract = getCookieClickerContract(provider);
      const score = await contract.getScore(address);
      return score.toNumber();
    },
    `player-score-${address}`,
    10000, // 10 second cache
    { priority: 'normal' }
  ).catch(error => {
    console.error("Error getting player score:", error);
    return 0; // Return 0 on error
  });
};

/**
 * Get clicks per token with caching
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @returns {Promise<number>} - Clicks per token
 */
export const getClicksPerToken = async (provider) => {
  if (!provider) {
    throw new Error("Provider is required");
  }
  
  return rateLimitedManager.request(
    async () => {
      const contract = getCookieClickerContract(provider);
      const clicksPerToken = await contract.clicksPerToken();
      return clicksPerToken.toNumber();
    },
    'clicks-per-token',
    60000, // 1 minute cache - this rarely changes
    { priority: 'low' }
  ).catch(error => {
    console.error("Error getting clicks per token:", error);
    return 10; // Default to 10 on error
  });
};

/**
 * Get redeemable tokens for a player with caching
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @param {string} address - Player's address
 * @returns {Promise<string>} - Redeemable tokens (formatted)
 */
export const getRedeemableTokens = async (provider, address) => {
  if (!provider || !address) {
    throw new Error("Provider and address are required");
  }
  
  return rateLimitedManager.request(
    async () => {
      const contract = getCookieClickerContract(provider);
      const rawTokens = await contract.getRedeemableTokens(address);
      return rawTokens.toString();
    },
    `redeemable-tokens-${address}`,
    10000, // 10 second cache
    { priority: 'normal' }
  ).catch(error => {
    console.error("Error getting redeemable tokens:", error);
    return "0";
  });
};

/**
 * Get token balance for an address with caching
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @param {string} address - Address to check
 * @returns {Promise<string>} - Formatted token balance
 */
export const getTokenBalance = async (provider, address) => {
  if (!provider || !address) {
    throw new Error("Provider and address are required");
  }
  
  return rateLimitedManager.request(
    async () => {
      const contract = getCookieTokenContract(provider);
      const decimals = await getTokenDecimals(provider);
      const balance = await contract.balanceOf(address);
      return ethers.utils.formatUnits(balance, decimals);
    },
    `token-balance-${address}`,
    10000, // 10 second cache
    { priority: 'normal' }
  ).catch(error => {
    console.error("Error getting token balance:", error);
    return "0";
  });
};

/**
 * Record a cookie click on the blockchain with enhanced error handling
 * @param {PersistentMonadGasWallet} gasWallet - The gas wallet
 * @returns {Promise<ethers.providers.TransactionResponse>} - The transaction response
 */
export const recordClick = async (gasWallet) => {
  if (!gasWallet) {
    throw new Error("Gas wallet is required");
  }
  
  const clickerInterface = new ethers.utils.Interface(COOKIE_CLICKER_ABI);
  const data = clickerInterface.encodeFunctionData("click");
  
  try {
    // Use a fixed gas limit for efficiency
    const gasLimit = ethers.BigNumber.from(85000); // Slightly reduced for efficiency
    
    const tx = {
      to: COOKIE_CLICKER_ADDRESS,
      data,
      gasLimit
    };
    
    // Clear related caches
    const walletAddress = gasWallet.getAddress();
    if (walletAddress) {
      rateLimitedManager.clearCache(`player-score-${walletAddress}`);
    }
    
    return await gasWallet.sendTransaction(tx);
  } catch (error) {
    console.error("Error recording click:", error);
    
    // Check for insufficient balance error
    if (error.message && (
      error.message.includes("insufficient balance") || 
      error.message.includes("Signer had insufficient balance")
    )) {
      throw new Error("Your gas wallet needs more MON! Please fund it using the 'Fund' button in the gas wallet section.");
    }
    
    // Special handling for rate limit errors
    if (error.message && error.message.includes('429')) {
      throw new Error("Alchemy API rate limit hit. Request will be queued and retried automatically.");
    }
    
    throw new Error("Failed to record click: " + (error.message || "Unknown error"));
  }
};

/**
 * Redeem cookies for tokens
 * @param {PersistentMonadGasWallet} gasWallet - The gas wallet
 * @param {number} [amount] - Optional specific amount to redeem (0 = redeem all eligible)
 * @returns {Promise<ethers.providers.TransactionResponse>} - The transaction response
 */
export const redeemCookies = async (gasWallet, amount = 0) => {
  if (!gasWallet) {
    throw new Error("Gas wallet is required");
  }
  
  // Validate amount
  if (typeof amount !== 'number' || amount < 0 || !Number.isInteger(amount)) {
    throw new Error("Invalid amount: must be a non-negative integer");
  }
  
  try {
    const clickerInterface = new ethers.utils.Interface(COOKIE_CLICKER_ABI);
    const data = clickerInterface.encodeFunctionData("redeem", [amount]);
    
    // Use higher gas limit for redeem - it's a more complex operation
    const gasLimit = ethers.BigNumber.from(180000);
    
    const tx = {
      to: COOKIE_CLICKER_ADDRESS,
      data,
      gasLimit
    };
    
    // Clear related caches
    const walletAddress = gasWallet.getAddress();
    if (walletAddress) {
      rateLimitedManager.clearCache(`player-score-${walletAddress}`);
      rateLimitedManager.clearCache(`redeemable-tokens-${walletAddress}`);
      rateLimitedManager.clearCache(`token-balance-${walletAddress}`);
    }
    
    return await gasWallet.sendTransaction(tx);
  } catch (error) {
    console.error("Error redeeming cookies:", error);
    
    // Check for insufficient balance error
    if (error.message && (
      error.message.includes("insufficient balance") || 
      error.message.includes("Signer had insufficient balance")
    )) {
      throw new Error("Your gas wallet needs more MON! Please fund it using the 'Fund' button.");
    }
    
    throw new Error("Failed to redeem cookies: " + (error.message || "Unknown error"));
  }
};

/**
 * Fund the clicker contract with tokens
 * @param {ethers.Signer} signer - The signer to use for the transaction
 * @param {string|number} amount - Amount of tokens to fund
 * @returns {Promise<ethers.providers.TransactionResponse>} - The transaction response
 */
export const fundClickerContract = async (signer, amount) => {
  if (!signer) {
    throw new Error("Signer is required");
  }
  
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    throw new Error("Invalid amount: must be a positive number");
  }
  
  try {
    // First, get token contract with the user's signer
    const tokenWithSigner = getCookieTokenContract(signer);
    const decimals = await getTokenDecimals(signer.provider);
    
    // Convert amount to token units
    const tokenAmount = ethers.utils.parseUnits(amount.toString(), decimals);
    
    // First, check if we need to approve the tokens
    const allowance = await tokenWithSigner.allowance(
      await signer.getAddress(),
      COOKIE_CLICKER_ADDRESS
    );
    
    // If allowance is less than token amount, we need to approve
    if (allowance.lt(tokenAmount)) {
      const approveTx = await tokenWithSigner.approve(
        COOKIE_CLICKER_ADDRESS,
        tokenAmount.mul(2) // Approve more than needed to reduce future transactions
      );
      await approveTx.wait();
    }
    
    // Now fund the contract
    const clickerWithSigner = getCookieClickerContract(signer);
    return await clickerWithSigner.fundContract(tokenAmount);
  } catch (error) {
    console.error("Error funding contract:", error);
    
    // Provide more user-friendly error messages
    if (error.message && error.message.includes("insufficient")) {
      throw new Error("You don't have enough tokens to fund the contract.");
    }
    
    throw new Error("Failed to fund contract: " + (error.message || "Unknown error"));
  }
};

/**
 * Fetch transactions from blockchain efficiently with caching
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @param {string} walletAddress - Wallet address to check
 * @param {number} blockCount - Number of blocks to look back
 * @returns {Promise<Array>} - Array of transactions
 */
export const fetchTransactionsFromBlockchain = async (provider, walletAddress, blockCount = 100) => {
  if (!provider || !walletAddress) {
    throw new Error("Provider and wallet address are required");
  }
  
  return rateLimitedManager.request(
    async () => {
      console.log(`Fetching transaction history for ${walletAddress}`);
      
      // Get current block number
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - blockCount);
      
      // Define events
      const events = [
        { 
          name: 'Click', 
          signature: 'Click(address,uint256)',
          processLog: (log, block, linterface) => {
            const parsedLog = linterface.parseLog(log);
            return {
              id: log.transactionHash,
              type: 'Click',
              txHash: log.transactionHash,
              status: 'confirmed',
              timestamp: new Date(block.timestamp * 1000).toLocaleTimeString(),
              points: 1,
              blockNumber: log.blockNumber
            };
          }
        },
        {
          name: 'Redeem',
          signature: 'Redeem(address,uint256,uint256)',
          processLog: (log, block, linterface) => {
            const parsedLog = linterface.parseLog(log);
            return {
              id: log.transactionHash,
              type: 'Redeem',
              txHash: log.transactionHash,
              status: 'confirmed',
              timestamp: new Date(block.timestamp * 1000).toLocaleTimeString(),
              points: -parsedLog.args.score.toNumber(),
              tokens: parsedLog.args.tokens.toNumber(),
              blockNumber: log.blockNumber
            };
          }
        },
        {
          name: 'Fund',
          signature: 'ContractFunded(address,uint256)',
          processLog: (log, block, linterface) => {
            const parsedLog = linterface.parseLog(log);
            return {
              id: log.transactionHash,
              type: 'Fund',
              txHash: log.transactionHash,
              status: 'confirmed',
              timestamp: new Date(block.timestamp * 1000).toLocaleTimeString(),
              amount: ethers.utils.formatUnits(parsedLog.args.amount, 18) + " $COOKIE",
              blockNumber: log.blockNumber
            };
          }
        }
      ];
      
      // Create interface for parsing logs
      const clickerInterface = new ethers.utils.Interface(COOKIE_CLICKER_ABI);
      
      // Process each event type sequentially to avoid rate limit issues
      let allTransactions = [];
      const blockCache = {};
      
      for (const event of events) {
        try {
          // Create filter for this event
          const filter = {
            fromBlock,
            address: COOKIE_CLICKER_ADDRESS,
            topics: [
              ethers.utils.id(event.signature),
              ethers.utils.hexZeroPad(walletAddress.toLowerCase(), 32)
            ]
          };
          
          // Get logs for this event
          const logs = await provider.getLogs(filter);
          
          // Process logs sequentially
          for (const log of logs) {
            try {
              // Get block info (with caching)
              if (!blockCache[log.blockNumber]) {
                blockCache[log.blockNumber] = await provider.getBlock(log.blockNumber);
              }
              const block = blockCache[log.blockNumber];
              
              // Process log into transaction object
              const tx = event.processLog(log, block, clickerInterface);
              allTransactions.push(tx);
            } catch (logError) {
              console.error(`Error processing ${event.name} log:`, logError);
            }
          }
        } catch (eventError) {
          console.error(`Error fetching ${event.name} events:`, eventError);
        }
      }
      
      // Sort by block number (descending)
      allTransactions.sort((a, b) => b.blockNumber - a.blockNumber);
      
      // Remove blockNumber from result
      return allTransactions.map(tx => {
        const { blockNumber, ...rest } = tx;
        return rest;
      });
    },
    `transaction-history-${walletAddress}-${blockCount}`,
    30000, // 30 second cache for transaction history
    { 
      priority: 'low',
      maxRetries: 2
    }
  ).catch(error => {
    console.error("Error fetching transaction history:", error);
    return [];
  });
};