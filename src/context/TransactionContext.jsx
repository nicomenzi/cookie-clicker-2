// src/context/TransactionContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useWalletContext } from './WalletContext';
import { fetchTransactionsFromBlockchain } from '../services/TransactionService';
import apiManager from '../services/ApiManager';

export const TransactionContext = createContext();

export const useTransactionContext = () => useContext(TransactionContext);

export const TransactionProvider = ({ children }) => {
  const { mainWallet, gasWallet } = useWalletContext();
  
  // Transaction state
  const [transactions, setTransactions] = useState([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [txQueue, setTxQueue] = useState([]);
  const [processingTxCount, setProcessingTxCount] = useState(0);
  const [networkStatus, setNetworkStatus] = useState('online');
  
  // Refs for tracking state without re-renders
  const txQueueRef = useRef([]);
  const lastTxUpdateRef = useRef(0);
  
  // Keep refs in sync with state
  useEffect(() => {
    txQueueRef.current = txQueue;
  }, [txQueue]);
  
  // Network status detection
  useEffect(() => {
    const handleOnline = () => setNetworkStatus('online');
    const handleOffline = () => setNetworkStatus('offline');
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  // Add a pending transaction to history
  const addPendingTransaction = useCallback((type, details) => {
    const txId = Date.now() + Math.random().toString(36).substring(2, 10);
    const pendingTx = {
      id: txId,
      type,
      status: 'pending',
      timestamp: new Date().toLocaleTimeString(),
      ...details
    };
    
    setTransactions(prev => {
      // Check for duplicate transactions (prevent double-submits)
      if (prev.some(tx => 
        tx.type === type && 
        tx.status === 'pending' && 
        JSON.stringify(details) === JSON.stringify({...tx, id: tx.id, type: tx.type, status: tx.status, timestamp: tx.timestamp})
      )) {
        return prev;
      }
      
      // Mark that we just updated transactions
      lastTxUpdateRef.current = Date.now();
      apiManager.registerUserActivity();
      
      return [pendingTx, ...prev.slice(0, 19)]; // Keep last 20
    });
    
    return txId;
  }, []);
  
  // Update transaction status
  const updateTransaction = useCallback((txId, details) => {
    setTransactions(prev => {
      // Mark that we just updated transactions
      lastTxUpdateRef.current = Date.now();
      apiManager.registerUserActivity();
      
      return prev.map(tx => 
        tx.id === txId ? { ...tx, ...details } : tx
      );
    });
  }, []);
  
  // Fetch transaction history
  const fetchTransactionHistory = useCallback(async (forceRefresh = false) => {
    // Skip if offline or no wallet connection
    if (networkStatus === 'offline' || !mainWallet.provider || !gasWallet.address) return;
    
    console.log("Attempting to fetch transaction history");
    
    // Don't show loading indicator if we already have transactions
    if (transactions.length === 0) {
      setIsLoadingTransactions(true);
    }
    
    try {
      // Specify a smaller block count for faster loading
      const blockCount = 100;
      
      // Fetch confirmed transactions from blockchain
      console.log("Fetching with address:", gasWallet.address);
      const confirmedTxs = await fetchTransactionsFromBlockchain(
        mainWallet.provider, gasWallet.address, blockCount
      );
      
      console.log("Received confirmed transactions:", confirmedTxs);
      
      // Get pending transactions (ones in our local state that haven't been confirmed yet)
      const pendingTxs = transactions.filter(tx => tx.status === 'pending');
      
      // Filter out any pending transactions that match confirmed ones
      const confirmedTxHashes = new Set(confirmedTxs.map(tx => tx.txHash));
      const filteredPendingTxs = pendingTxs.filter(tx => 
        !tx.txHash || !confirmedTxHashes.has(tx.txHash)
      );
      
      // Combine pending and confirmed transactions
      const combinedTxs = [...filteredPendingTxs, ...confirmedTxs];
      
      // Only keep the most recent 20 transactions
      const limitedTxs = combinedTxs.slice(0, 20);
      
      console.log("Setting transactions:", limitedTxs);
      
      // Update transaction list
      setTransactions(limitedTxs);
      
      // Remember that we just updated
      lastTxUpdateRef.current = Date.now();
    } catch (error) {
      console.error("Error fetching transaction history:", error);
    } finally {
      setIsLoadingTransactions(false);
    }
  }, [mainWallet.provider, gasWallet.address, transactions, networkStatus]);
  
  // Add a transaction to the queue
  const queueTransaction = useCallback((type, id, details = {}) => {
    setTxQueue(prev => [...prev, { type, id, ...details }]);
  }, []);
  
  // Process transactions in the queue
  const processNextTransaction = useCallback(async () => {
    const currentQueue = txQueueRef.current;
    
    if (currentQueue.length === 0) return;
    
    // Process first transaction in queue
    const tx = currentQueue[0];
    
    // Update queue
    setTxQueue(prev => prev.slice(1));
    
    // Increment processing count
    setProcessingTxCount(prev => prev + 1);
    
    // Transaction is now being processed
    updateTransaction(tx.id, {
      status: 'processing'
    });
    
    // Decrement processing count when done
    // This would normally contain transaction processing logic
    // but we've moved that to the GameContext directly
    setTimeout(() => {
      setProcessingTxCount(prev => Math.max(0, prev - 1));
    }, 1000);
  }, [updateTransaction]);
  
  // Queue processing loop
  useEffect(() => {
    if (networkStatus === 'offline' || txQueue.length === 0) return;
    
    const processorId = setInterval(() => {
      if (processingTxCount < 3) { // Process max 3 at a time
        processNextTransaction();
      }
    }, 200);
    
    return () => clearInterval(processorId);
  }, [networkStatus, txQueue, processingTxCount, processNextTransaction]);
  
  // Initial transaction fetch with throttling
  useEffect(() => {
    if (mainWallet.provider && gasWallet.address) {
      console.log("Setting up transaction history fetching");
      
      // Initial fetch - just once
      let initialFetchDone = false;
      const initialFetchTimeout = setTimeout(() => {
        if (!initialFetchDone) {
          initialFetchDone = true;
          fetchTransactionHistory(true);
        }
      }, 2000);
      
      // Periodic fetch with proper throttling
      let lastFetchTime = 0;
      const FETCH_COOLDOWN = 10000; // 10 seconds between fetches minimum
      
      const refreshInterval = setInterval(() => {
        const now = Date.now();
        // Only fetch if enough time has passed AND tab is visible
        if (document.visibilityState === 'visible' && now - lastFetchTime > FETCH_COOLDOWN) {
          lastFetchTime = now;
          fetchTransactionHistory(false);
        }
      }, 15000); // Check every 15 seconds, but respect the cooldown
      
      return () => {
        clearTimeout(initialFetchTimeout);
        clearInterval(refreshInterval);
      };
    }
  }, [mainWallet.provider, gasWallet.address]);
  
  // Periodic transaction refresh
  useEffect(() => {
    if (mainWallet.provider && gasWallet.address) {
      const refreshInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchTransactionHistory(false);
        }
      }, 30000); // 30 seconds
      
      // Fetch on visibility change
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          fetchTransactionHistory(false);
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      return () => {
        clearInterval(refreshInterval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [mainWallet.provider, gasWallet.address, fetchTransactionHistory]);
  
  // Context value
  const contextValue = {
    transactions,
    isLoadingTransactions,
    processingTxCount,
    queueLength: txQueue.length,
    addPendingTransaction,
    updateTransaction,
    fetchTransactionHistory,
    queueTransaction
  };
  
  return (
    <TransactionContext.Provider value={contextValue}>
      {children}
    </TransactionContext.Provider>
  );
};