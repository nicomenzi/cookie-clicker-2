// src/services/TransactionService.js
import { ethers } from 'ethers';
import { getCookieClickerContract, getCookieTokenContract, getTokenDecimals } from './ContractService';
import { COOKIE_TOKEN_ADDRESS, COOKIE_CLICKER_ADDRESS, COOKIE_CLICKER_ABI } from '../constants/contracts';
import { MONAD_TESTNET } from '../constants/blockchain';

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
    
    // Send transaction directly without going through apiManager
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
    
    // Send transaction directly without going through apiManager
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
  if (!provider) {
    provider = new ethers.providers.JsonRpcProvider(MONAD_TESTNET.rpcUrls[0]);
  }
  
  if (!walletAddress) {
    throw new Error("Wallet address is required");
  }
  
  try {
    console.log(`Fetching transaction history for ${walletAddress}`, new Date().toLocaleTimeString());
    
    // Get current block number
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - blockCount);
    
    console.log(`Current block: ${currentBlock}, Looking from block: ${fromBlock}`);
    
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
    
    // Process each event type
    let allTransactions = [];
    const blockCache = {};
    
    for (const event of events) {
      try {
        console.log(`Fetching ${event.name} events`);
        
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
        console.log(`Found ${logs.length} ${event.name} logs`);
        
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
    
    console.log(`Total transactions found: ${allTransactions.length}`);
    
    // Remove blockNumber from result
    return allTransactions.map(tx => {
      const { blockNumber, ...rest } = tx;
      return rest;
    });
  } catch (error) {
    console.error("Error fetching transaction history:", error);
    return [];
  }
};