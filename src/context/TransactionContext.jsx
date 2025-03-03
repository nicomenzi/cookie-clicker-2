// src/context/TransactionContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useWalletContext } from './WalletContext';
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
  
  // Simplified version - gets recent transactions from memory only
  // We no longer fetch transaction history from blockchain to save API calls
  const getRecentTransactions = useCallback(() => {
    if (!gasWallet.address) return [];
    
    // Return current in-memory transactions
    return transactions;
  }, [transactions, gasWallet.address]);
  
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
  
  // Clean up old transactions periodically
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      if (transactions.length > 20) {
        // Keep only the most recent 20 transactions
        setTransactions(prev => prev.slice(0, 20));
      }
    }, 5 * 60 * 1000); // Every 5 minutes
    
    return () => clearInterval(cleanupInterval);
  }, [transactions]);
  
  // Context value
  const contextValue = {
    transactions,
    isLoadingTransactions,
    processingTxCount,
    queueLength: txQueue.length,
    addPendingTransaction,
    updateTransaction,
    getRecentTransactions,
    queueTransaction
  };
  
  return (
    <TransactionContext.Provider value={contextValue}>
      {children}
    </TransactionContext.Provider>
  );
};