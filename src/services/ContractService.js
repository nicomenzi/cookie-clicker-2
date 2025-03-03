// src/services/ContractService.js
import { ethers } from 'ethers';
import { 
  COOKIE_TOKEN_ADDRESS, 
  COOKIE_CLICKER_ADDRESS,
  COOKIE_TOKEN_ABI,
  COOKIE_CLICKER_ABI
} from '../constants/contracts';
import { MONAD_TESTNET } from '../constants/blockchain';
import apiManager from './ApiManager';

// Contract instances cache
let clickerContract = null;
let tokenContract = null;
let contractDecimals = null;

/**
 * Get provider with proper RPC URL
 * @param {string} rpcUrl - Optional specific RPC URL
 * @returns {ethers.providers.Provider} - The provider instance
 */
const getProvider = (rpcUrl) => {
  return new ethers.providers.JsonRpcProvider(rpcUrl || MONAD_TESTNET.rpcUrls[0]);
};

/**
 * Get cookie clicker contract with caching
 * @param {ethers.providers.Provider|ethers.Signer} signerOrProvider - Provider or signer
 * @param {string} rpcUrl - Optional specific RPC URL
 * @returns {ethers.Contract} - The contract instance
 */
export const getCookieClickerContract = (signerOrProvider, rpcUrl) => {
  if (!signerOrProvider) {
    // Use the preferred RPC from ApiManager
    signerOrProvider = getProvider(rpcUrl);
  }
  
  // Reset contract when provider changes
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
 * @param {string} rpcUrl - Optional specific RPC URL
 * @returns {ethers.Contract} - The contract instance
 */
export const getCookieTokenContract = (signerOrProvider, rpcUrl) => {
  if (!signerOrProvider) {
    // Use the preferred RPC from ApiManager
    signerOrProvider = getProvider(rpcUrl);
  }
  
  try {
    console.log("Initializing token contract with address:", COOKIE_TOKEN_ADDRESS);
    
    // Reset contract when provider changes
    if (!tokenContract || tokenContract.provider !== signerOrProvider) {
      console.log("Creating new token contract instance");
      tokenContract = new ethers.Contract(
        COOKIE_TOKEN_ADDRESS,
        COOKIE_TOKEN_ABI,
        signerOrProvider
      );
      console.log("Token contract instance created successfully");
    } else {
      console.log("Using existing token contract instance");
    }
    
    return tokenContract;
  } catch (error) {
    console.error("Error initializing token contract:", {
      message: error.message,
      code: error.code,
      stack: error.stack,
      provider: signerOrProvider ? 'exists' : 'missing'
    });
    throw error;
  }
};

/**
 * Check if the CookieClicker contract has tokens to distribute with caching
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @returns {Promise<boolean>} - True if contract has tokens
 */
export const checkContractHasTokens = async (provider) => {
  // Use API manager for rate-limited request
  return apiManager.request(async (rpcUrl) => {
    if (!provider) {
      provider = getProvider(rpcUrl);
    }
    
    try {
      const contract = getCookieClickerContract(provider, rpcUrl);
      const balance = await contract.getContractBalance();
      return !balance.isZero();
    } catch (error) {
      console.error("Error checking contract tokens:", error);
      return true; // Assume tokens are available on error
    }
  }, 'contract-has-tokens', 300000, { priority: 'low' }); // Cache for 5 minutes, lower priority
};

/**
 * Get player's score with caching
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @param {string} address - Player's address
 * @returns {Promise<number>} - Player's score
 */
export const getPlayerScore = async (provider, address) => {
  if (!address) {
    throw new Error("Address is required");
  }
  
  // Use API manager for rate-limited request
  return apiManager.request(async (rpcUrl) => {
    if (!provider) {
      provider = getProvider(rpcUrl);
    }
    
    try {
      const contract = getCookieClickerContract(provider, rpcUrl);
      const score = await contract.getScore(address);
      return score.toNumber();
    } catch (error) {
      console.error("Error getting player score:", error);
      return 0; // Return 0 on error
    }
  }, `player-score:${address}`, 30000, { priority: 'high' }); // Cache for 30 seconds, high priority
};

/**
 * Get clicks per token with caching
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @returns {Promise<number>} - Clicks per token
 */
export const getClicksPerToken = async (provider) => {
  // Use API manager for rate-limited request
  return apiManager.request(async (rpcUrl) => {
    if (!provider) {
      provider = getProvider(rpcUrl);
    }
    
    try {
      const contract = getCookieClickerContract(provider, rpcUrl);
      const clicksPerToken = await contract.clicksPerToken();
      return clicksPerToken.toNumber();
    } catch (error) {
      console.error("Error getting clicks per token:", error);
      return 10; // Default to 10 on error
    }
  }, 'clicks-per-token', 1800000, { priority: 'low' }); // Cache for 30 minutes, lower priority
};

/**
 * Get redeemable tokens for a player with caching
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @param {string} address - Player's address
 * @returns {Promise<string>} - Redeemable tokens (formatted)
 */
export const getRedeemableTokens = async (provider, address) => {
  if (!address) {
    throw new Error("Address is required");
  }
  
  // Use API manager for rate-limited request
  return apiManager.request(async (rpcUrl) => {
    if (!provider) {
      provider = getProvider(rpcUrl);
    }
    
    try {
      const contract = getCookieClickerContract(provider, rpcUrl);
      const rawTokens = await contract.getRedeemableTokens(address);
      return rawTokens.toString();
    } catch (error) {
      console.error("Error getting redeemable tokens:", error);
      return "0";
    }
  }, `redeemable-tokens:${address}`, 180000, { priority: 'normal' }); // Cache for 3 minutes
};

/**
 * Get token balance for an address with caching
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @param {string} address - Address to check
 * @returns {Promise<string>} - Formatted token balance
 */
export const getTokenBalance = async (provider, address) => {
  if (!address) {
    throw new Error("Address is required");
  }
  
  // Use API manager for rate-limited request
  return apiManager.request(async (rpcUrl) => {
    if (!provider) {
      console.log("No provider provided for balance check, getting new provider...");
      provider = getProvider(rpcUrl);
    }
    
    try {
      console.log(`Fetching token balance for ${address}...`);
      const contract = getCookieTokenContract(provider, rpcUrl);
      console.log("Got token contract instance");
      
      console.log("Getting token decimals...");
      const decimals = 18
      console.log("Got token decimals:", decimals);
      
      console.log("Calling balanceOf...");
      
      // Try a direct approach first instead of using Promise.race with timeout
      const balance = await contract.balanceOf(address);
      console.log("Raw balance from contract:", balance.toString());
      
      const formattedBalance = ethers.utils.formatUnits(balance, decimals);
      console.log(`Retrieved token balance: ${formattedBalance} $COOKIE`);
      return formattedBalance;
    } catch (error) {
      console.error("Error getting token balance:", error.message);
      throw new Error(`Failed to get token balance: ${error.message}`);
    }
  }, `token-balance:${address}`, 10000, { priority: 'high' }); // Cache for only 10 seconds, highest priority
};