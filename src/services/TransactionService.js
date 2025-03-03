// src/services/TransactionService.js
import { ethers } from 'ethers';
import { getCookieClickerContract, getCookieTokenContract, getTokenDecimals } from './ContractService';
import { COOKIE_TOKEN_ADDRESS, COOKIE_CLICKER_ADDRESS, COOKIE_CLICKER_ABI } from '../constants/contracts';
import { MONAD_TESTNET } from '../constants/blockchain';
import apiManager from './ApiManager';

/**
 * Record a cookie click on the blockchain with enhanced error handling
 * @param {PersistentGasWallet} gasWallet - The gas wallet
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
    const gasLimit = ethers.BigNumber.from(85000);
    
    const tx = {
      to: COOKIE_CLICKER_ADDRESS,
      data,
      gasLimit
    };
    
    // Send transaction through ApiManager to respect rate limits
    return await apiManager.sendTransaction(() => gasWallet.sendTransaction(tx));
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
    if (error.message && (
      error.message.includes('429') || 
      error.message.includes('rate limit') ||
      error.message.includes('requests limited')
    )) {
      throw new Error("API rate limit hit. Request will be queued and retried automatically.");
    }
    
    throw new Error("Failed to record click: " + (error.message || "Unknown error"));
  }
};

/**
 * Redeem cookies for tokens
 * @param {PersistentGasWallet} gasWallet - The gas wallet
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
    
    // Send transaction through ApiManager to respect rate limits
    return await apiManager.sendTransaction(() => gasWallet.sendTransaction(tx));
  } catch (error) {
    console.error("Error redeeming cookies:", error);
    
    // Check for insufficient balance error
    if (error.message && (
      error.message.includes("insufficient balance") || 
      error.message.includes("Signer had insufficient balance")
    )) {
      throw new Error("Your gas wallet needs more MON! Please fund it using the 'Fund' button.");
    }
    
    // Special handling for rate limit errors
    if (error.message && (
      error.message.includes('429') || 
      error.message.includes('rate limit') ||
      error.message.includes('requests limited')
    )) {
      throw new Error("API rate limit hit. Request will be queued and retried automatically.");
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
    const allowance = await apiManager.request(async () => {
      return tokenWithSigner.allowance(
        await signer.getAddress(),
        COOKIE_CLICKER_ADDRESS
      );
    });
    
    // If allowance is less than token amount, we need to approve
    if (allowance.lt(tokenAmount)) {
      // This is a transaction, use sendTransaction
      const approveTx = await apiManager.sendTransaction(() => 
        tokenWithSigner.approve(
          COOKIE_CLICKER_ADDRESS,
          tokenAmount.mul(2) // Approve more than needed to reduce future transactions
        )
      );
      await approveTx.wait();
    }
    
    // Now fund the contract
    const clickerWithSigner = getCookieClickerContract(signer);
    return await apiManager.sendTransaction(() => 
      clickerWithSigner.fundContract(tokenAmount)
    );
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
 * Fetch minimal transactions only for recent activity - significantly reduced to minimize API calls
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @param {string} walletAddress - Wallet address to check
 * @param {number} blockCount - Number of blocks to look back (reduced)
 * @returns {Promise<Array>} - Array of transactions
 */
export const fetchTransactionsFromBlockchain = async (provider, walletAddress, blockCount = 20) => {
  if (!provider) {
    return []; // Skip API call if no provider
  }
  
  if (!walletAddress) {
    return []; // Skip API call if no wallet address
  }
  
  // Check if we've fetched in the last 5 minutes
  const cacheKey = `tx-history:${walletAddress}`;
  if (apiManager.hasInCache(cacheKey)) {
    return apiManager.getFromCache(cacheKey);
  }
  
  // Only do this when necessary and with reduced block scope
  return apiManager.request(async (rpcUrl) => {
    try {
      if (rpcUrl && rpcUrl !== provider.connection.url) {
        provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      }
      
      console.log(`Fetching minimal transaction history for ${walletAddress}`, new Date().toLocaleTimeString());
      
      // Get current block number
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - blockCount); // Drastically reduced block count
      
      console.log(`Current block: ${currentBlock}, Looking from block: ${fromBlock} (minimized scope)`);
      
      // Define only Click events to minimize API calls
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
        }
      ];
      
      // Create interface for parsing logs
      const clickerInterface = new ethers.utils.Interface(COOKIE_CLICKER_ABI);
      
      // Process each event type
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
          
          // Process logs
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
      
      // Only keep a limited number of transactions
      allTransactions = allTransactions.slice(0, 10);
      
      // Remove blockNumber from result
      return allTransactions.map(tx => {
        const { blockNumber, ...rest } = tx;
        return rest;
      });
    } catch (error) {
      console.error("Error fetching transaction history:", error);
      return [];
    }
  }, cacheKey, 5 * 60 * 1000, { priority: 'low' }); // Cache for 5 minutes with low priority
};