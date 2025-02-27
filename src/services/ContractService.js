// src/services/ContractService.js
import { ethers } from 'ethers';
import { 
  COOKIE_TOKEN_ADDRESS, 
  COOKIE_CLICKER_ADDRESS,
  COOKIE_TOKEN_ABI,
  COOKIE_CLICKER_ABI
} from '../constants/contracts';
import { MONAD_TESTNET } from '../constants/blockchain';

// Contract instances cache
let clickerContract = null;
let tokenContract = null;
let contractDecimals = null;

/**
 * Get cookie clicker contract with caching
 * @param {ethers.providers.Provider|ethers.Signer} signerOrProvider - Provider or signer
 * @returns {ethers.Contract} - The contract instance
 */
export const getCookieClickerContract = (signerOrProvider) => {
  if (!signerOrProvider) {
    // Use the Alchemy RPC from constants
    signerOrProvider = new ethers.providers.JsonRpcProvider(MONAD_TESTNET.rpcUrls[0]);
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
 * @returns {ethers.Contract} - The contract instance
 */
export const getCookieTokenContract = (signerOrProvider) => {
  if (!signerOrProvider) {
    // Use the Alchemy RPC from constants
    signerOrProvider = new ethers.providers.JsonRpcProvider(MONAD_TESTNET.rpcUrls[0]);
  }
  
  // Reset contract when provider changes
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
  
  if (!provider) {
    provider = new ethers.providers.JsonRpcProvider(MONAD_TESTNET.rpcUrls[0]);
  }
  
  try {
    const contract = getCookieTokenContract(provider);
    const decimals = await contract.decimals();
    contractDecimals = decimals;
    return decimals;
  } catch (error) {
    console.error("Error getting token decimals:", error);
    return 18; // Default to 18 on error
  }
};

/**
 * Check if the CookieClicker contract has tokens to distribute with caching
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @returns {Promise<boolean>} - True if contract has tokens
 */
export const checkContractHasTokens = async (provider) => {
  if (!provider) {
    provider = new ethers.providers.JsonRpcProvider(MONAD_TESTNET.rpcUrls[0]);
  }
  
  try {
    const contract = getCookieClickerContract(provider);
    const balance = await contract.getContractBalance();
    return !balance.isZero();
  } catch (error) {
    console.error("Error checking contract tokens:", error);
    return true; // Assume tokens are available on error
  }
};

/**
 * Get player's score with caching
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @param {string} address - Player's address
 * @returns {Promise<number>} - Player's score
 */
export const getPlayerScore = async (provider, address) => {
  if (!provider) {
    provider = new ethers.providers.JsonRpcProvider(MONAD_TESTNET.rpcUrls[0]);
  }
  
  if (!address) {
    throw new Error("Address is required");
  }
  
  try {
    const contract = getCookieClickerContract(provider);
    const score = await contract.getScore(address);
    return score.toNumber();
  } catch (error) {
    console.error("Error getting player score:", error);
    return 0; // Return 0 on error
  }
};

/**
 * Get clicks per token with caching
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @returns {Promise<number>} - Clicks per token
 */
export const getClicksPerToken = async (provider) => {
  if (!provider) {
    provider = new ethers.providers.JsonRpcProvider(MONAD_TESTNET.rpcUrls[0]);
  }
  
  try {
    const contract = getCookieClickerContract(provider);
    const clicksPerToken = await contract.clicksPerToken();
    return clicksPerToken.toNumber();
  } catch (error) {
    console.error("Error getting clicks per token:", error);
    return 10; // Default to 10 on error
  }
};

/**
 * Get redeemable tokens for a player with caching
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @param {string} address - Player's address
 * @returns {Promise<string>} - Redeemable tokens (formatted)
 */
export const getRedeemableTokens = async (provider, address) => {
  if (!provider) {
    provider = new ethers.providers.JsonRpcProvider(MONAD_TESTNET.rpcUrls[0]);
  }
  
  if (!address) {
    throw new Error("Address is required");
  }
  
  try {
    const contract = getCookieClickerContract(provider);
    const rawTokens = await contract.getRedeemableTokens(address);
    return rawTokens.toString();
  } catch (error) {
    console.error("Error getting redeemable tokens:", error);
    return "0";
  }
};

/**
 * Get token balance for an address with caching
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @param {string} address - Address to check
 * @returns {Promise<string>} - Formatted token balance
 */
export const getTokenBalance = async (provider, address) => {
  if (!provider) {
    provider = new ethers.providers.JsonRpcProvider(MONAD_TESTNET.rpcUrls[0]);
  }
  
  if (!address) {
    throw new Error("Address is required");
  }
  
  try {
    const contract = getCookieTokenContract(provider);
    const decimals = await getTokenDecimals(provider);
    const balance = await contract.balanceOf(address);
    return ethers.utils.formatUnits(balance, decimals);
  } catch (error) {
    console.error("Error getting token balance:", error);
    return "0";
  }
};