// src/context/TransactionContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { useWalletContext } from './WalletContext';
import apiManager from '../services/ApiManager';

export const TransactionContext = createContext();

export const useTransactionContext = () => useContext(TransactionContext);

export const TransactionProvider = ({ children }) => {
  const { mainWallet, gasWallet } = useWalletContext();
  
  // Transaction state
  const [transactions, setTransactions] = useState([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(true); // Start as true to avoid initial loading
  const [txQueue, setTxQueue] = useState([]);
  const [processingTxCount, setProcessingTxCount] = useState(0);
  const [networkStatus, setNetworkStatus] = useState('online');
  const [loadError, setLoadError] = useState(null);
  
  // Refs for tracking state without re-renders
  const txQueueRef = useRef([]);
  const lastTxUpdateRef = useRef(0);
  const fetchInProgressRef = useRef(false);
  
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
  
  // No transaction history fetching - now just a placeholder function that cleans pending transactions
  const fetchTransactionHistory = useCallback(async (forceRefresh = false) => {
    // Skip if already fetching, offline, or no wallet
    if (fetchInProgressRef.current || networkStatus === 'offline' || !mainWallet.provider || !gasWallet.address) {
      return;
    }
    
    // Mark as in progress briefly
    fetchInProgressRef.current = true;
    
    try {
      // Clean up pending transactions older than 10 minutes (they probably failed)
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      
      setTransactions(prev => {
        // Filter out old pending transactions
        const filtered = prev.filter(tx => 
          tx.status !== 'pending' || new Date(tx.timestamp).getTime() > tenMinutesAgo
        );
        
        // If nothing changed, return the same array
        if (filtered.length === prev.length) return prev;
        
        return filtered;
      });
    } catch (error) {
      // Silent error handling
    } finally {
      fetchInProgressRef.current = false;
    }
  }, [mainWallet.provider, gasWallet.address, networkStatus]);
  
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
  
  // Periodic cleanup of old pending transactions
  useEffect(() => {
    if (mainWallet.provider && gasWallet.address) {
      const cleanupInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchTransactionHistory(false);
        }
      }, 60000); // Run cleanup every minute
      
      return () => clearInterval(cleanupInterval);
    }
  }, [mainWallet.provider, gasWallet.address, fetchTransactionHistory]);
  
  // Manual refresh - just cleans up old pending transactions, doesn't fetch from blockchain
  const manualRefresh = useCallback(() => {
    if (mainWallet.provider && gasWallet.address) {
      fetchTransactionHistory(true);
    }
  }, [mainWallet.provider, gasWallet.address, fetchTransactionHistory]);
  
  // Context value
  const contextValue = {
    transactions,
    isLoadingTransactions,
    hasInitiallyLoaded,
    loadError,
    processingTxCount,
    queueLength: txQueue.length,
    addPendingTransaction,
    updateTransaction,
    fetchTransactionHistory: manualRefresh,
    queueTransaction
  };
  
  return (
    <TransactionContext.Provider value={contextValue}>
      {children}
    </TransactionContext.Provider>
  );
};