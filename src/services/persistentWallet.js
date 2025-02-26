// src/services/persistentWallet.js
import { ethers } from 'ethers';

/**
 * A wallet that persists across sessions by deriving its private key
 * from a signature from the user's main wallet
 */
export class PersistentMonadGasWallet {
  constructor(provider) {
    this.provider = provider;
    this.wallet = null;
    this.balance = ethers.BigNumber.from(0);
    this.currentNonce = null; // Track nonce for sequential transactions
  }

  /**
   * Create a deterministic wallet using the user's signature
   * @param {string} userAddress - The user's main wallet address
   * @param {ethers.Signer} signer - The user's wallet signer
   * @returns {Promise<string>} - The gas wallet address
   */
  async create(userAddress, signer) {
    try {
      // This specific message will be used to derive the gas wallet
      const message = `Generate my persistent gas wallet for Monad Cookie Clicker - ${userAddress}`;
      
      // Get signature from the user's wallet (this is deterministic for the same message)
      const signature = await signer.signMessage(message);
      
      // Use the signature as a seed to derive a private key
      // We hash it to get a proper length for a private key
      const privateKeyBytes = ethers.utils.arrayify(
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(signature))
      );
      
      // Create wallet from this deterministic private key
      this.wallet = new ethers.Wallet(privateKeyBytes).connect(this.provider);
      
      // Initialize the nonce
      this.currentNonce = await this.provider.getTransactionCount(this.wallet.address);
      
      return this.wallet.address;
    } catch (error) {
      console.error("Error creating deterministic wallet:", error);
      throw error;
    }
  }

  /**
   * Get the current wallet balance
   * @returns {Promise<ethers.BigNumber>} - The wallet balance
   */
  async getBalance() {
    if (!this.wallet) return ethers.BigNumber.from(0);
    this.balance = await this.provider.getBalance(this.wallet.address);
    return this.balance;
  }

  /**
   * Estimate gas for a transaction
   * @param {Object} tx - The transaction object
   * @returns {Promise<ethers.BigNumber>} - The estimated gas
   */
  async estimateGas(tx) {
    return await this.provider.estimateGas(tx);
  }

  /**
   * Send a transaction with managed nonce
   * @param {Object} tx - The transaction object
   * @returns {Promise<ethers.providers.TransactionResponse>} - The transaction response
   */
  async sendTransaction(tx) {
    if (!this.wallet) throw new Error("Wallet not initialized");
    
    const balance = await this.getBalance();
    if (balance.eq(0)) throw new Error("Gas wallet has no MON");
    
    // Make sure we have the current nonce
    if (this.currentNonce === null) {
      this.currentNonce = await this.provider.getTransactionCount(this.wallet.address);
    }
    
    // Add the nonce to the transaction
    const txWithNonce = {
      ...tx,
      nonce: this.currentNonce
    };
    
    // Increment the nonce for the next transaction
    this.currentNonce++;
    
    // Sign and send the transaction using the gas wallet
    return await this.wallet.sendTransaction(txWithNonce);
  }
  
  /**
   * Get the current wallet address
   * @returns {string|null} - The wallet address or null if not initialized
   */
  getAddress() {
    return this.wallet ? this.wallet.address : null;
  }
}