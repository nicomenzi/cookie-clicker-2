// src/services/persistentWallet.js
import { ethers } from 'ethers';
import { MONAD_TESTNET } from '../constants/blockchain';

/**
 * A wallet that persists across sessions by deriving its private key
 * from a signature from the user's main wallet with enhanced security
 */
export class PersistentMonadGasWallet {
  constructor(provider) {
    this.provider = provider;
    this.wallet = null;
    this.balance = ethers.BigNumber.from(0);
    this.currentNonce = null;
    this.pendingTxCount = 0;
    // Safe upper limit to avoid too many pending transactions
    this.maxPendingTx = 25;
    
    // Create a backup Alchemy provider for redundancy
    this.alchemyProvider = null;
    this.useAlchemyFallback = false;
    this.initAlchemyProvider();
  }
  
  /**
   * Initialize the Alchemy provider as fallback
   */
  initAlchemyProvider() {
    try {
      this.alchemyProvider = new ethers.providers.JsonRpcProvider(MONAD_TESTNET.rpcUrls[0]);
    } catch (error) {
      console.error("Failed to initialize Alchemy fallback provider:", error);
    }
  }
  
  /**
   * Get the best provider to use
   * @returns {ethers.providers.Provider} - The provider to use
   */
  getProvider() {
    if (this.useAlchemyFallback && this.alchemyProvider) {
      return this.alchemyProvider;
    }
    return this.provider;
  }

  /**
   * Create a deterministic wallet using the user's signature with additional entropy
   * @param {string} userAddress - The user's main wallet address
   * @param {ethers.Signer} signer - The user's wallet signer
   * @returns {Promise<string>} - The gas wallet address
   */
  async create(userAddress, signer) {
    try {
      // Add additional entropy sources for security
      const domainSalt = "monad-cookie-clicker-v1"; // Domain-specific salt
      
      // Create a more complex message that's still deterministic but harder to guess
      const message = `Generate my persistent gas wallet for ${domainSalt} - Address:${userAddress} - App:CookieClicker`;
      
      // Get signature from the user's wallet
      const signature = await signer.signMessage(message);
      
      // Use PBKDF2-like approach by hashing multiple times for key strengthening
      let derivedKey = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(signature));
      
      // Multiple hashing rounds (PBKDF2-like approach)
      for (let i = 0; i < 1000; i++) {
        derivedKey = ethers.utils.keccak256(
          ethers.utils.concat([
            ethers.utils.arrayify(derivedKey),
            ethers.utils.arrayify(ethers.utils.id(userAddress + domainSalt))
          ])
        );
      }
      
      // Create wallet from this deterministic private key
      this.wallet = new ethers.Wallet(ethers.utils.arrayify(derivedKey)).connect(this.getProvider());
      
      // Initialize the nonce
      await this.refreshNonce();
      
      return this.wallet.address;
    } catch (error) {
      console.error("Error creating deterministic wallet:", error);
      throw new Error("Failed to create secure gas wallet: " + error.message);
    }
  }

  /**
   * Get the current wallet balance with cache to prevent recursion
   * @returns {Promise<ethers.BigNumber>} - The wallet balance
   */
  async getBalance() {
    if (!this.wallet) return ethers.BigNumber.from(0);
    
    // Use a static balance for 5 seconds to prevent recursive calls
    const now = Date.now();
    if (this._lastBalanceCheck && (now - this._lastBalanceCheck) < 5000) {
      return this.balance;
    }
    
    try {
      this._lastBalanceCheck = now;
      this.balance = await this.getProvider().getBalance(this.wallet.address);
      
      // Check if balance is very low or zero and warn
      if (this.balance.lte(ethers.utils.parseEther("0.001"))) {
        console.warn("⚠️ Gas wallet balance is very low! Please fund it with more MON.");
      }
      
      return this.balance;
    } catch (error) {
      console.error("Error getting wallet balance:", error);
      
      // Try the alternate provider if main one fails
      if (!this.useAlchemyFallback && this.alchemyProvider) {
        try {
          this.useAlchemyFallback = true;
          this.balance = await this.alchemyProvider.getBalance(this.wallet.address);
          return this.balance;
        } catch (fallbackError) {
          console.error("Fallback provider also failed:", fallbackError);
          this.useAlchemyFallback = false;
        }
      }
      
      // Return last known balance on error to prevent cascading failures
      return this.balance;
    }
  }

  /**
   * Refresh the current nonce from the blockchain
   */
  async refreshNonce() {
    if (!this.wallet) throw new Error("Wallet not initialized");
    
    try {
      this.currentNonce = await this.getProvider().getTransactionCount(this.wallet.address);
      this.pendingTxCount = 0; // Reset pending transaction count
      return this.currentNonce;
    } catch (error) {
      console.error("Error refreshing nonce:", error);
      
      // Try alternate provider if main one fails
      if (!this.useAlchemyFallback && this.alchemyProvider) {
        try {
          this.useAlchemyFallback = true;
          this.currentNonce = await this.alchemyProvider.getTransactionCount(this.wallet.address);
          this.pendingTxCount = 0;
          return this.currentNonce;
        } catch (fallbackError) {
          console.error("Fallback provider also failed for nonce:", fallbackError);
          this.useAlchemyFallback = false;
          throw new Error("Failed to refresh nonce with all providers");
        }
      } else {
        throw new Error("Failed to refresh nonce: " + (error.message || "Unknown error"));
      }
    }
  }

  /**
   * Estimate gas for a transaction
   * @param {Object} tx - The transaction object
   * @returns {Promise<ethers.BigNumber>} - The estimated gas
   */
  async estimateGas(tx) {
    try {
      return await this.getProvider().estimateGas({
        ...tx,
        from: this.wallet.address
      });
    } catch (error) {
      console.error("Gas estimation failed:", error);
      
      // Try alternate provider if main one fails
      if (!this.useAlchemyFallback && this.alchemyProvider) {
        try {
          this.useAlchemyFallback = true;
          return await this.alchemyProvider.estimateGas({
            ...tx,
            from: this.wallet.address
          });
        } catch (fallbackError) {
          console.error("Fallback provider also failed for gas estimation:", fallbackError);
          this.useAlchemyFallback = false;
        }
      }
      
      throw new Error("Failed to estimate gas: " + error.message);
    }
  }

  /**
   * Send a transaction with managed nonce and gas price optimization
   * @param {Object} tx - The transaction object
   * @returns {Promise<ethers.providers.TransactionResponse>} - The transaction response
   */
  async sendTransaction(tx) {
    if (!this.wallet) throw new Error("Wallet not initialized");
    
    // Add security check for maximum pending transactions to prevent nonce issues
    if (this.pendingTxCount >= this.maxPendingTx) {
      throw new Error(`Too many pending transactions (${this.pendingTxCount}). Please wait for some to confirm.`);
    }
    
    // Use cached balance check to prevent recursion
    const balance = await this.getBalance();
    if (balance.eq(0)) throw new Error("Gas wallet has no MON");
    
    try {
      // Make sure we have the current nonce
      if (this.currentNonce === null) {
        await this.refreshNonce();
      }
      
      // Use the current provider for gas price
      const currentProvider = this.getProvider();
      
      // Use a cached gas price that updates only every 10 seconds
      let adjustedGasPrice;
      if (!this._cachedGasPrice || !this._lastGasPriceCheck || (Date.now() - this._lastGasPriceCheck) > 10000) {
        try {
          const gasPrice = await currentProvider.getGasPrice();
          adjustedGasPrice = gasPrice.mul(110).div(100);
          this._cachedGasPrice = adjustedGasPrice;
          this._lastGasPriceCheck = Date.now();
        } catch (error) {
          console.error("Error getting gas price:", error);
          // If gas price fetch fails, use last known or default
          adjustedGasPrice = this._cachedGasPrice || ethers.utils.parseUnits("1", "gwei");
        }
      } else {
        adjustedGasPrice = this._cachedGasPrice;
      }
      
      // Create transaction with optimized parameters
      const txWithNonce = {
        ...tx,
        nonce: this.currentNonce,
        gasPrice: adjustedGasPrice
      };
      
      // Increment the nonce for the next transaction
      this.currentNonce++;
      this.pendingTxCount++;
      
      // Make sure wallet is connected to current provider
      if (this.wallet.provider !== currentProvider) {
        // Create a new wallet instance with the same key but different provider
        const connectedWallet = new ethers.Wallet(this.wallet.privateKey, currentProvider);
        const response = await connectedWallet.sendTransaction(txWithNonce);
        
        // Setup automatic nonce reset on failure
        this.setupTransactionWatcher(response);
        return response;
      } else {
        // Sign and send the transaction using the gas wallet
        const response = await this.wallet.sendTransaction(txWithNonce);
        
        // Setup automatic nonce reset on failure
        this.setupTransactionWatcher(response);
        return response;
      }
    } catch (error) {
      console.error("Transaction error:", error);
      
      // Handle specific errors
      if (error.message && error.message.includes("nonce")) {
        await this.refreshNonce();
        throw new Error("Transaction nonce error. Please try again.");
      }
      
      // Handle rate limit errors
      if (error.message && (
        error.message.includes('429') || 
        error.message.includes('rate limit') ||
        error.message.includes('requests limited')
      )) {
        // Try to switch providers
        if (!this.useAlchemyFallback && this.alchemyProvider) {
          this.useAlchemyFallback = !this.useAlchemyFallback;
          console.warn("Switching to alternative provider due to rate limit");
        }
        
        throw new Error("Transaction failed due to API rate limits. Please try again.");
      }
      
      throw error;
    }
  }
  
  /**
   * Setup transaction monitoring to update pending count
   * @param {ethers.providers.TransactionResponse} response - The transaction response
   */
  setupTransactionWatcher(response) {
    response.wait()
      .then(() => {
        this.pendingTxCount = Math.max(0, this.pendingTxCount - 1);
      })
      .catch(async (error) => {
        console.error("Transaction failed:", error);
        // Reset nonce on serious errors
        if (error.message && 
           (error.message.includes("nonce") || 
            error.message.includes("replacement transaction underpriced") ||
            error.message.includes("already known"))) {
          await this.refreshNonce();
        } else {
          this.pendingTxCount = Math.max(0, this.pendingTxCount - 1);
        }
      });
  }
  
  /**
   * Get the current wallet address
   * @returns {string|null} - The wallet address or null if not initialized
   */
  getAddress() {
    return this.wallet ? this.wallet.address : null;
  }
}