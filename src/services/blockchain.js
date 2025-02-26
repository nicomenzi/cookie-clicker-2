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
      
      // Get raw redeemable tokens (this is the number of whole tokens)
      const rawTokens = await contract.getRedeemableTokens(address);
      
      // Simply format the result - no need to multiply by 10^decimals because 
      // the contract already returns the number of whole tokens
      return rawTokens.toString();
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
 * @param {number} blockCount - Number of blocks to look back (default: 1000)
 * @returns {Promise<Array>} - Array of transactions
 */
export const fetchTransactionHistory = async (provider, walletAddress, blockCount = 1000) => {
    try {
      console.log(`Fetching transaction history for ${walletAddress}`);
      
      // Get the current block number
      const currentBlock = await provider.getBlockNumber();
      console.log(`Current block: ${currentBlock}`);
      
      // Calculate from block (going back blockCount blocks)
      const fromBlock = Math.max(0, currentBlock - blockCount);
      console.log(`Fetching events from block ${fromBlock}`);
      
      // Create filter for Click events
      const clickFilter = {
        fromBlock,
        address: COOKIE_CLICKER_ADDRESS,
        topics: [
          ethers.utils.id("Click(address,uint256)"),
          ethers.utils.hexZeroPad(walletAddress.toLowerCase(), 32)
        ]
      };
      
      // Create filter for Redeem events
      const redeemFilter = {
        fromBlock,
        address: COOKIE_CLICKER_ADDRESS,
        topics: [
          ethers.utils.id("Redeem(address,uint256,uint256)"),
          ethers.utils.hexZeroPad(walletAddress.toLowerCase(), 32)
        ]
      };
      
      // Create filter for ContractFunded events
      const fundedFilter = {
        fromBlock,
        address: COOKIE_CLICKER_ADDRESS,
        topics: [
          ethers.utils.id("ContractFunded(address,uint256)"),
          ethers.utils.hexZeroPad(walletAddress.toLowerCase(), 32)
        ]
      };
      
      // Get logs in parallel
      const [clickLogs, redeemLogs, fundedLogs] = await Promise.all([
        provider.getLogs(clickFilter),
        provider.getLogs(redeemFilter),
        provider.getLogs(fundedFilter)
      ]);
      
      console.log(`Found ${clickLogs.length} click events, ${redeemLogs.length} redeem events, and ${fundedLogs.length} funding events`);
      
      // Create contract interface to decode logs
      const clickerInterface = new ethers.utils.Interface(COOKIE_CLICKER_ABI);
      
      // Process the logs to create transactions
      const transactions = [];
      
      // Process Click events
      for (const log of clickLogs) {
        try {
          const parsedLog = clickerInterface.parseLog(log);
          
          // Get block info for timestamp
          const block = await provider.getBlock(log.blockNumber);
          
          // Add to transactions
          transactions.push({
            id: log.transactionHash,
            type: 'Click',
            txHash: log.transactionHash,
            status: 'confirmed',
            timestamp: new Date(block.timestamp * 1000).toLocaleTimeString(),
            points: 1,
            blockNumber: log.blockNumber
          });
        } catch (error) {
          console.error("Error parsing click log:", error);
        }
      }
      
      // Process Redeem events
      for (const log of redeemLogs) {
        try {
          const parsedLog = clickerInterface.parseLog(log);
          
          // Get block info for timestamp
          const block = await provider.getBlock(log.blockNumber);
          
          // Add to transactions
          transactions.push({
            id: log.transactionHash,
            type: 'Redeem',
            txHash: log.transactionHash,
            status: 'confirmed',
            timestamp: new Date(block.timestamp * 1000).toLocaleTimeString(),
            points: -parsedLog.args.score.toNumber(),
            tokens: parsedLog.args.tokens.toNumber(),
            blockNumber: log.blockNumber
          });
        } catch (error) {
          console.error("Error parsing redeem log:", error);
        }
      }
      
      // Process ContractFunded events
      for (const log of fundedLogs) {
        try {
          const parsedLog = clickerInterface.parseLog(log);
          
          // Get block info for timestamp
          const block = await provider.getBlock(log.blockNumber);
          
          // Add to transactions
          transactions.push({
            id: log.transactionHash,
            type: 'Fund',
            txHash: log.transactionHash,
            status: 'confirmed',
            timestamp: new Date(block.timestamp * 1000).toLocaleTimeString(),
            amount: ethers.utils.formatUnits(parsedLog.args.amount, 18) + " $COOKIE",
            blockNumber: log.blockNumber
          });
        } catch (error) {
          console.error("Error parsing fund log:", error);
        }
      }
      
      // Sort transactions by block number (descending)
      transactions.sort((a, b) => b.blockNumber - a.blockNumber);
      
      // Remove the blockNumber property (we don't need it in the UI)
      return transactions.map(tx => {
        const { blockNumber, ...txWithoutBlock } = tx;
        return txWithoutBlock;
      });
    } catch (error) {
      console.error("Error fetching transaction history:", error);
      return [];
    }
  };