// src/services/blockchain.js
import { ethers } from 'ethers';
import { MONAD_TESTNET } from '../constants/blockchain';
import { 
  COOKIE_TOKEN_ADDRESS, 
  COOKIE_CLICKER_ADDRESS,
  COOKIE_TOKEN_ABI,
  COOKIE_CLICKER_ABI
} from '../constants/contracts';

/**
 * Connect to browser wallet (MetaMask, etc.)
 * @returns {Promise<{provider: ethers.providers.Web3Provider, signer: ethers.Signer, address: string}>}
 */
export const connectWallet = async () => {
  if (!window.ethereum) {
    throw new Error("No Ethereum wallet found. Please install MetaMask or similar.");
  }
  
  await window.ethereum.request({ method: 'eth_requestAccounts' });
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  
  // Check if we're on Monad network
  const network = await provider.getNetwork();
  if (network.chainId !== 10143) { // Monad Testnet chainId
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
  
  const signer = provider.getSigner();
  const address = await signer.getAddress();
  
  return { provider, signer, address };
};

/**
 * Get cookie clicker contract
 * @param {ethers.providers.Provider|ethers.Signer} signerOrProvider - Provider or signer
 * @returns {ethers.Contract} - The contract instance
 */
export const getCookieClickerContract = (signerOrProvider) => {
  return new ethers.Contract(
    COOKIE_CLICKER_ADDRESS,
    COOKIE_CLICKER_ABI,
    signerOrProvider
  );
};

/**
 * Get cookie token contract
 * @param {ethers.providers.Provider|ethers.Signer} signerOrProvider - Provider or signer
 * @returns {ethers.Contract} - The contract instance
 */
export const getCookieTokenContract = (signerOrProvider) => {
  return new ethers.Contract(
    COOKIE_TOKEN_ADDRESS,
    COOKIE_TOKEN_ABI,
    signerOrProvider
  );
};

/**
 * Check if the CookieClicker contract has tokens to distribute
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @returns {Promise<boolean>} - True if contract has tokens
 */
export const checkContractHasTokens = async (provider) => {
    try {
      const contract = getCookieClickerContract(provider);
      const balance = await contract.getContractBalance();
      return !balance.isZero();
    } catch (error) {
      console.error("Error checking contract token balance:", error);
      return false;
    }
  };
/**
 * Fund the CookieClicker contract with tokens
 * @param {ethers.Signer} signer - User's wallet signer
 * @param {string} amount - Amount of tokens to fund
 * @returns {Promise<ethers.providers.TransactionResponse>} - The transaction response
 */
export const fundClickerContract = async (signer, amount) => {
    const tokenContract = getCookieTokenContract(signer);
    const clickerContract = getCookieClickerContract(signer);
    
    // Get token decimals
    const decimals = await tokenContract.decimals();
    
    // Parse the amount with proper decimals
    const parsedAmount = ethers.utils.parseUnits(amount, decimals);
    
    // First approve the tokens
    const tx1 = await tokenContract.approve(
      COOKIE_CLICKER_ADDRESS, 
      parsedAmount
    );
    await tx1.wait();
    
    // Then fund the contract
    return await clickerContract.fundContract(parsedAmount);
  };

/**
 * Get player's score
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @param {string} address - Player's address
 * @returns {Promise<number>} - Player's score
 */
export const getPlayerScore = async (provider, address) => {
  const contract = getCookieClickerContract(provider);
  const score = await contract.getScore(address);
  return score.toNumber();
};

/**
 * Get redeemable tokens for a player
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @param {string} address - Player's address
 * @returns {Promise<string>} - Redeemable tokens (formatted)
 */
export const getRedeemableTokens = async (provider, address) => {
    try {
      const contract = getCookieClickerContract(provider);
      const tokenContract = getCookieTokenContract(provider);
      
      // Get token decimals
      const decimals = await tokenContract.decimals();
      
      // Get raw redeemable tokens
      const rawTokens = await contract.getRedeemableTokens(address);
      
      // Convert to formatted string with proper decimals
      // This represents the actual number of full tokens (not wei)
      return ethers.utils.formatUnits(rawTokens.mul(ethers.BigNumber.from(10).pow(decimals)), decimals);
    } catch (error) {
      console.error("Error getting redeemable tokens:", error);
      return "0";
    }
  };

/**
 * Record a cookie click on the blockchain
 * @param {PersistentMonadGasWallet} gasWallet - The gas wallet
 * @returns {Promise<ethers.providers.TransactionResponse>} - The transaction response
 */
export const recordClick = async (gasWallet) => {
  const clickerInterface = new ethers.utils.Interface(COOKIE_CLICKER_ABI);
  const data = clickerInterface.encodeFunctionData("click");
  
  const tx = {
    to: COOKIE_CLICKER_ADDRESS,
    data,
    gasLimit: 100000 // Optimized contract should use less gas
  };
  
  return await gasWallet.sendTransaction(tx);
};

/**
 * Record multiple clicks at once (gas optimization)
 * @param {PersistentMonadGasWallet} gasWallet - The gas wallet
 * @param {number} numClicks - Number of clicks to record (1-50)
 * @returns {Promise<ethers.providers.TransactionResponse>} - The transaction response
 */

/**
 * Redeem cookies for tokens
 * @param {PersistentMonadGasWallet} gasWallet - The gas wallet
 * @param {number} [amount] - Optional specific amount to redeem (0 = redeem all eligible)
 * @returns {Promise<ethers.providers.TransactionResponse>} - The transaction response
 */
export const redeemCookies = async (gasWallet, amount = 0) => {
  const clickerInterface = new ethers.utils.Interface(COOKIE_CLICKER_ABI);
  const data = clickerInterface.encodeFunctionData("redeem", [amount]);
  
  const tx = {
    to: COOKIE_CLICKER_ADDRESS,
    data,
    gasLimit: 200000
  };
  
  return await gasWallet.sendTransaction(tx);
};

/**
 * Fetch transaction history from blockchain
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @param {string} walletAddress - Wallet address to check
 * @returns {Promise<Array>} - Array of transactions
 */
export const fetchTransactionHistory = async (provider, walletAddress) => {
  try {
    // Get the recent transactions from the wallet
    const filter = {
      fromBlock: Math.max(0, await provider.getBlockNumber() - 1000), // Last ~1000 blocks
      address: COOKIE_CLICKER_ADDRESS, // Filter to only cookie clicker contract
    };

    const logs = await provider.getLogs(filter);
    
    // Create contract interface to decode logs
    const clickerInterface = new ethers.utils.Interface(COOKIE_CLICKER_ABI);
    
    // Process the logs to find our transactions
    const transactions = [];
    
    for (const log of logs) {
      try {
        // Try to parse the log
        const parsedLog = clickerInterface.parseLog(log);
        
        // Skip logs that aren't our events
        if (!parsedLog) continue;
        
        // Check if this transaction is from our wallet
        if (parsedLog.name === 'Click' && 
            parsedLog.args.player && 
            parsedLog.args.player.toLowerCase() === walletAddress.toLowerCase()) {
          
          // Get the score change from the previous score if possible
          const scoreChange = 1; // Default to 1 for single clicks
          
          // Add to our transactions
          transactions.push({
            id: log.transactionHash,
            type: 'Click',
            txHash: log.transactionHash,
            status: 'confirmed',
            timestamp: new Date().toLocaleTimeString(),
            points: scoreChange
          });
        }
        else if (parsedLog.name === 'Redeem' && 
                parsedLog.args.player && 
                parsedLog.args.player.toLowerCase() === walletAddress.toLowerCase()) {
          
          // Add to our transactions
          transactions.push({
            id: log.transactionHash,
            type: 'Redeem',
            txHash: log.transactionHash,
            status: 'confirmed',
            timestamp: new Date().toLocaleTimeString(),
            points: -parsedLog.args.score.toNumber(),
            tokens: parsedLog.args.tokens.toNumber()
          });
        }
        else if (parsedLog.name === 'ContractFunded' && 
                parsedLog.args.funder && 
                parsedLog.args.funder.toLowerCase() === walletAddress.toLowerCase()) {
          
          // Add funding transaction
          transactions.push({
            id: log.transactionHash,
            type: 'Fund Contract',
            txHash: log.transactionHash,
            status: 'confirmed',
            timestamp: new Date().toLocaleTimeString(),
            amount: ethers.utils.formatUnits(parsedLog.args.amount, 18) + " $COOKIE"
          });
        }
      } catch (error) {
        // Skip logs we can't parse
        continue;
      }
    }
    
    return transactions;
  } catch (error) {
    console.error("Error fetching transaction history:", error);
    return [];
  }
};