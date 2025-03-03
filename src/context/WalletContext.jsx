// src/context/WalletContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { connectWallet } from '../services/WalletService';
import { PersistentGasWallet } from '../services/WalletService';
import { MONAD_TESTNET } from '../constants/blockchain'; 

export const WalletContext = createContext();

export const useWalletContext = () => useContext(WalletContext);

export const WalletProvider = ({ children }) => {
  // Main wallet state
  const [mainWallet, setMainWallet] = useState({
    connected: false,
    address: '',
    provider: null,
    signer: null,
  });
  
  // Gas wallet state
  const [gasWallet, setGasWallet] = useState({
    instance: null,
    address: '',
    balance: '0',
  });
  
  const [loading, setLoading] = useState(false);
  
  // Connect main wallet
  const connectMainWallet = async () => {
    setLoading(true);
    try {
      // Get wallet connection from browser
      const { provider, signer, address } = await connectWallet();
      
      // Create a secondary Alchemy provider for read operations
      const alchemyProvider = new ethers.providers.JsonRpcProvider(
        MONAD_TESTNET.rpcUrls[0]
      );
      
      // Update main wallet state
      setMainWallet({
        connected: true,
        address,
        provider: alchemyProvider, // Use Alchemy for high-rate reads
        signer, // Keep original signer for transactions
      });
      
      // Initialize gas wallet with Alchemy provider
      await initializeGasWallet(alchemyProvider, address, signer);
    } catch (error) {
      console.error("Error connecting wallet:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };
  
  // Initialize gas wallet
  const initializeGasWallet = async (provider, userAddress, signer) => {
    try {
      const wallet = new PersistentGasWallet(provider);
      const address = await wallet.create(userAddress, signer);
      
      setGasWallet({
        instance: wallet,
        address,
        balance: ethers.utils.formatEther(await wallet.getBalance()),
      });
    } catch (error) {
      console.error("Error initializing gas wallet:", error);
      throw error;
    }
  };
  
  // Fund gas wallet
  const fundGasWallet = async (amount) => {
    if (!mainWallet.signer || !gasWallet.address) throw new Error("Wallet not connected");
    
    setLoading(true);
    try {
      // Send MON from main wallet to gas wallet
      const tx = await mainWallet.signer.sendTransaction({
        to: gasWallet.address,
        value: ethers.utils.parseEther(amount)
      });
      
      await tx.wait();
      
      // Update gas wallet balance
      if (gasWallet.instance) {
        const balance = await gasWallet.instance.getBalance();
        setGasWallet(prev => ({
          ...prev,
          balance: ethers.utils.formatEther(balance),
        }));
      }
      
      return tx.hash;
    } catch (error) {
      console.error("Error funding gas wallet:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };
  
  // Update gas wallet balance
  const updateGasWalletBalance = async () => {
    if (!gasWallet.instance) return;
    
    try {
      const balance = await gasWallet.instance.getBalance();
      setGasWallet(prev => ({
        ...prev,
        balance: ethers.utils.formatEther(balance),
      }));
    } catch (error) {
      console.error("Error updating gas wallet balance:", error);
    }
  };
  
  // Check if wallet is already connected on load
  useEffect(() => {
    const checkConnection = async () => {
      if (window.ethereum) {
        try {
          const provider = new ethers.providers.Web3Provider(window.ethereum);
          const accounts = await provider.listAccounts();
          
          if (accounts.length > 0) {
            // User is already connected
            connectMainWallet();
          }
        } catch (error) {
          console.error("Error checking connection:", error);
        }
      }
    };
    
    checkConnection();
  }, []);
  
  // Periodically update gas wallet balance
  useEffect(() => {
    if (gasWallet.instance) {
      const intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') {
          updateGasWalletBalance();
        }
      }, 30000); // 30 seconds
      
      return () => clearInterval(intervalId);
    }
  }, [gasWallet.instance]);
  
  return (
    <WalletContext.Provider value={{
      mainWallet,
      gasWallet,
      loading,
      connectMainWallet,
      fundGasWallet,
      updateGasWalletBalance,
    }}>
      {children}
    </WalletContext.Provider>
  );
};