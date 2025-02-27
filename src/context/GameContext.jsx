// src/context/GameContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ethers } from 'ethers';
import { useWalletContext } from './WalletContext';
import { 
  getCookieClickerContract, 
  getCookieTokenContract,
  recordClick,
  redeemCookies,
  fetchTransactionsFromBlockchain,
  checkContractHasTokens,
  getPlayerScore,
  getRedeemableTokens
} from '../services/blockchain';

// Create error tracking module
const errorTracker = {
  errors: [],
  maxErrors: 20,
  
  add(error, context) {
    const timestamp = Date.now();
    const errorMsg = error?.message || String(error);
    const errorWithContext = { 
      timestamp, 
      message: errorMsg, 
      context: context || 'unknown',
      count: 1
    };
    
    // Check if we already have this error recently (deduplication)
    const existingError = this.errors.find(e => 
      e.message === errorMsg && e.context === context && 
      (timestamp - e.timestamp) < 60000
    );
    
    if (existingError) {
      existingError.count++;
      existingError.timestamp = timestamp;
    } else {
      this.errors.unshift(errorWithContext);
      // Keep only the most recent errors
      if (this.errors.length > this.maxErrors) {
        this.errors.pop();
      }
    }
    
    // Log to console for development
    console.error(`Error in ${context}: ${errorMsg}`);
  },
  
  // Get recent errors
  getRecent(count = 10) {
    return this.errors.slice(0, count);
  }
};

const GameContext = createContext();

export const useGameContext = () => useContext(GameContext);

export const GameProvider = ({ children }) => {
  const { mainWallet, gasWallet } = useWalletContext();
  
  // Game state
  const [confirmedScore, setConfirmedScore] = useState(0);
  const [pendingClicks, setPendingClicks] = useState(0);
  const [cookieBalance, setCookieBalance] = useState('0');
  const [redeemableTokens, setRedeemableTokens] = useState('0');
  const [clicksPerToken, setClicksPerToken] = useState(10);
  const [cookies, setCookies] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [txQueue, setTxQueue] = useState([]);
  const [contractHasTokens, setContractHasTokens] = useState(true);
  const [processingTxCount, setProcessingTxCount] = useState(0);
  // No longer need isClickEnabled state
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(0);
  const [dataLoadError, setDataLoadError] = useState(null);
  const [networkStatus, setNetworkStatus] = useState('online');
  
  // Refs to track processing state without re-renders
  const processingRef = useRef(false);
  const txQueueRef = useRef([]);
  const processingCountRef = useRef(0);
  
  // Keep refs in sync with state - this avoids re-renders triggering effects
  useEffect(() => {
    txQueueRef.current = txQueue;
    processingCountRef.current = processingTxCount;
  }, [txQueue, processingTxCount]);
  
  // Constants - OPTIMIZED FOR ALCHEMY API
  const MAX_CONCURRENT_TX = 25; // Reduced from 100 to a more reasonable value
  const MAX_QUEUE_LENGTH = 100; // Maximum number of transactions in the queue
  const DATA_REFRESH_INTERVAL = 45000; // 45 seconds between data refreshes
  const TX_HISTORY_REFRESH_INTERVAL = 90000; // 90 seconds between tx history refreshes
  const MIN_REFRESH_INTERVAL = 10000; // Minimum 10s between refreshes
  
  // Calculate total score (confirmed + pending)
  const score = useMemo(() => confirmedScore + pendingClicks, [confirmedScore, pendingClicks]);

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
    const txId = Date.now() + Math.random().toString(36).substring(2, 10); // More unique ID
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
      
      return [pendingTx, ...prev.slice(0, 19)]; // Keep last 20
    });
    
    return txId;
  }, []);

  // Update transaction status
  const updateTransaction = useCallback((txId, details) => {
    setTransactions(prev => 
      prev.map(tx => 
        tx.id === txId ? { ...tx, ...details } : tx
      )
    );
  }, []);
  
  // Handle cookie click without rate limiting
  const handleClick = useCallback(async (e) => {
    try {
      if (!mainWallet.connected) {
        throw new Error("Please connect your wallet first!");
      }
      
      if (!gasWallet.instance || gasWallet.balance === "0") {
        throw new Error("Please fund your gas wallet with MON first!");
      }
      
      // Network check
      if (networkStatus === 'offline') {
        throw new Error("You appear to be offline. Please check your internet connection.");
      }
      
      // Queue size check
      if (txQueueRef.current.length >= MAX_QUEUE_LENGTH) {
        throw new Error(`Queue is full (${MAX_QUEUE_LENGTH} pending). Please wait for transactions to process.`);
      }
      
      // Create animation cookie
      const cookie = {
        id: Date.now(),
        x: e.clientX,
        y: e.clientY,
      };
      setCookies(prev => [...prev, cookie]);
      
      // Add a pending transaction to history for click
      const txId = addPendingTransaction('Click', { points: 1 });
      
      // Add to queue
      setTxQueue(prev => [...prev, { type: 'Click', id: txId }]);
      
      // Optimistic update of pending clicks count
      setPendingClicks(prev => prev + 1);
    } catch (error) {
      alert(error.message);
    }
  }, [
    mainWallet.connected, 
    gasWallet.instance, 
    gasWallet.balance, 
    addPendingTransaction,
    networkStatus,
    MAX_QUEUE_LENGTH
  ]);

  // Handle redeeming cookies for tokens
  const handleRedeem = useCallback(async (amount = 0) => {
    if (!mainWallet.connected) {
      throw new Error("Please connect your wallet first!");
    }
    
    if (!gasWallet.instance || gasWallet.balance === "0") {
      throw new Error("Please fund your gas wallet with MON first!");
    }
    
    if (!contractHasTokens) {
      throw new Error("Contract has no tokens to distribute. Please fund it first.");
    }
    
    // Network check
    if (networkStatus === 'offline') {
      throw new Error("You appear to be offline. Please check your internet connection.");
    }
    
    // Validate amount is non-negative integer
    if (typeof amount !== 'number' || amount < 0 || (amount > 0 && !Number.isInteger(amount))) {
      throw new Error("Invalid redemption amount.");
    }
    
    // Queue size check
    if (txQueueRef.current.length >= MAX_QUEUE_LENGTH) {
      throw new Error(`Queue is full (${MAX_QUEUE_LENGTH} pending). Please wait for transactions to process.`);
    }
    
    // Calculate how many points will be redeemed
    let pointsToRedeem = amount;
    if (amount === 0) {
      // Calculate redeemable points based on confirmed score
      pointsToRedeem = Math.floor(confirmedScore / clicksPerToken) * clicksPerToken;
    }
    
    // Security checks
    if (pointsToRedeem === 0) {
      throw new Error(`You need at least ${clicksPerToken} points to redeem for 1 token.`);
    }
    
    if (pointsToRedeem > confirmedScore) {
      throw new Error(`Not enough confirmed points! You need at least ${pointsToRedeem} points.`);
    }
    
    // Calculate tokens to receive
    const tokensToReceive = pointsToRedeem / clicksPerToken;
    
    // Add a pending transaction to history
    const txId = addPendingTransaction('Redeem', { 
      points: -pointsToRedeem, 
      tokens: tokensToReceive 
    });
    
    // Add to queue with higher priority
    setTxQueue(prev => {
      // Put redeem transactions at the front of the queue
      const newQueue = [...prev];
      newQueue.unshift({ 
        type: 'Redeem', 
        id: txId, 
        amount: pointsToRedeem 
      });
      return newQueue;
    });
  }, [
    mainWallet.connected, 
    gasWallet.instance, 
    gasWallet.balance, 
    contractHasTokens, 
    confirmedScore, 
    clicksPerToken, 
    addPendingTransaction,
    networkStatus,
    MAX_QUEUE_LENGTH
  ]);
  
  // Process a single transaction with better error handling
  const processTransaction = async (tx) => {
    try {
      if (tx.type === 'Click') {
        // Send transaction using gas wallet
        const response = await recordClick(gasWallet.instance);
        
        // Update transaction in history with hash but still pending
        updateTransaction(tx.id, {
          txHash: response.hash
        });
        
        // Wait for transaction to be mined
        await response.wait();
        
        // Update transaction in history as confirmed
        updateTransaction(tx.id, {
          status: 'confirmed'
        });
        
        // Update confirmed score and decrease pending clicks
        setConfirmedScore(prev => prev + 1);
        setPendingClicks(prev => Math.max(0, prev - 1));
      } else if (tx.type === 'Redeem') {
        // Send transaction using gas wallet
        const response = await redeemCookies(gasWallet.instance, tx.amount);
        
        // Update transaction in history with hash but still pending
        updateTransaction(tx.id, {
          txHash: response.hash
        });
        
        // Wait for transaction to be mined
        await response.wait();
        
        // Update transaction in history as confirmed
        updateTransaction(tx.id, {
          status: 'confirmed'
        });
        
        // Trigger data reload but with a delay to avoid rate limits
        setTimeout(() => loadUserData(true), 2000);
      }
    } catch (error) {
      errorTracker.add(error, `Processing ${tx.type} transaction`);
      
      // Update transaction status as failed with a clear message
      const errorMessage = error.message || "Unknown error";
      let userFriendlyMessage = errorMessage;
      
      // Special handling for insufficient balance errors
      if (errorMessage.includes("insufficient balance") || errorMessage.includes("Signer had insufficient balance")) {
        userFriendlyMessage = "Your gas wallet needs more MON! Please fund it using the 'Fund' button.";
      }
      
      // Update transaction in UI
      if (tx.type === 'Click') {
        updateTransaction(tx.id, {
          status: 'failed',
          error: userFriendlyMessage
        });
        
        // Decrease pending clicks count
        setPendingClicks(prev => Math.max(0, prev - 1));
      } else if (tx.type === 'Redeem') {
        updateTransaction(tx.id, {
          status: 'failed',
          error: userFriendlyMessage
        });
      }
      
      // Handle nonce errors
      if (error.message && (
          error.message.includes("nonce") || 
          error.message.includes("replacement transaction underpriced") ||
          error.message.includes("already known")
      )) {
        try {
          if (gasWallet.instance) {
            await gasWallet.instance.refreshNonce();
          }
        } catch (nonceError) {
          errorTracker.add(nonceError, "Refreshing nonce");
        }
      }
    }
  };

  // Optimized transaction processing with improved parallelism
  useEffect(() => {
    if (networkStatus === 'offline' || !gasWallet.instance) return;
    
    let timeoutId = null;
    
    // Non-recursive transaction processor with optimized throughput
    const processNextTransaction = () => {
      // Clear any existing timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      // Get current queue state
      const currentQueue = txQueueRef.current;
      
      if (currentQueue.length === 0) {
        // No transactions to process, check again later
        timeoutId = setTimeout(processNextTransaction, 50);
        return;
      }
      
      // Process multiple transactions at once with controlled parallelism
      const availableSlots = MAX_CONCURRENT_TX - processingCountRef.current;
      
      if (availableSlots <= 0) {
        // We're at capacity, wait and check again
        timeoutId = setTimeout(processNextTransaction, 50);
        return;
      }
      
      // Process as many as possible up to available slots, but don't exceed 5 at a time
      // to better manage rate limits
      const transactionsToProcess = Math.min(availableSlots, currentQueue.length, 5);
      
      // Get the transactions to process
      const transactions = currentQueue.slice(0, transactionsToProcess);
      
      // Remove from queue - using a functional update to avoid race conditions
      setTxQueue(prevQueue => prevQueue.slice(transactionsToProcess));
      
      // Increment processing count
      setProcessingTxCount(prev => prev + transactionsToProcess);
      
      // Process each transaction in parallel
      transactions.forEach(tx => {
        processTransaction(tx)
          .catch(error => {
            console.error("Failed to process transaction:", error);
          })
          .finally(() => {
            // Decrement processing count when done
            setProcessingTxCount(prev => Math.max(0, prev - 1));
          });
      });
      
      // Schedule next batch processing with a small delay to avoid overwhelming the blockchain
      timeoutId = setTimeout(processNextTransaction, 100);
    };
    
    // Start the processor
    timeoutId = setTimeout(processNextTransaction, 10);
    
    // Cleanup
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [gasWallet.instance, networkStatus, MAX_CONCURRENT_TX]);
  
  // Load user data from blockchain
  const loadUserData = useCallback(async (forceRefresh = false) => {
    // Skip if offline
    if (networkStatus === 'offline') return;
    
    try {
      if (!mainWallet.provider || !gasWallet.address) return;
      
      // Check if enough time has passed since last refresh
      const now = Date.now();
      if (!forceRefresh && (now - lastRefresh) < MIN_REFRESH_INTERVAL) {
        return; // Don't refresh too frequently
      }
      
      setLastRefresh(now);
      setDataLoadError(null);
      
      // Get contract first to read configuration
      const clickerContract = getCookieClickerContract(mainWallet.provider);
      
      // Get clicks per token
      try {
        const clicksPerToken = await clickerContract.clicksPerToken();
        setClicksPerToken(clicksPerToken.toNumber());
      } catch (error) {
        errorTracker.add(error, "Getting clicks per token");
        // Continue with other data
      }
      
      // Load player score
      try {
        const playerScore = await getPlayerScore(mainWallet.provider, gasWallet.address);
        setConfirmedScore(playerScore);
      } catch (error) {
        errorTracker.add(error, "Getting player score");
        // Continue with other data
      }
      
      // Load redeemable tokens
      try {
        const redeemableValue = await getRedeemableTokens(mainWallet.provider, gasWallet.address);
        setRedeemableTokens(redeemableValue);
      } catch (error) {
        errorTracker.add(error, "Getting redeemable tokens");
        // Continue with other data
      }
      
      // Check if contract has tokens
      try {
        const hasTokens = await checkContractHasTokens(mainWallet.provider);
        setContractHasTokens(hasTokens);
      } catch (error) {
        errorTracker.add(error, "Checking contract tokens");
        // Continue with other data
      }
      
      // Get token balance - separate try/catch because this is less critical
      try {
        const tokenContract = getCookieTokenContract(mainWallet.provider);
        const decimals = await tokenContract.decimals();
        const balance = await tokenContract.balanceOf(gasWallet.address);
        setCookieBalance(ethers.utils.formatUnits(balance, decimals));
      } catch (error) {
        errorTracker.add(error, "Getting token balance");
        // Non-critical error
      }
    } catch (error) {
      errorTracker.add(error, "Loading user data");
      setDataLoadError("Failed to load game data. Will retry soon.");
    }
  }, [mainWallet.provider, gasWallet.address, lastRefresh, networkStatus, MIN_REFRESH_INTERVAL]);

  // Fetch transaction history with reduced frequency
  const fetchTransactionHistory = useCallback(async () => {
    // Skip if offline
    if (networkStatus === 'offline') return;
    
    if (!mainWallet.provider || !gasWallet.address) return;
    
    // Don't show loading indicator if we already have transactions
    if (transactions.length === 0) {
      setIsLoadingTransactions(true);
    }
    
    try {
      // Use a smaller block count to reduce request size
      const blockCount = 100; // Reduced from 250
      
      // Fetch confirmed transactions from blockchain
      const confirmedTxs = await fetchTransactionsFromBlockchain(
        mainWallet.provider, gasWallet.address, blockCount
      );
      
      // Get pending transactions (ones in our local state that haven't been confirmed yet)
      const pendingTxs = transactions.filter(tx => tx.status === 'pending');
      
      // Filter out any pending transactions that match confirmed ones
      const confirmedTxHashes = new Set(confirmedTxs.map(tx => tx.txHash));
      const filteredPendingTxs = pendingTxs.filter(tx => 
        !tx.txHash || !confirmedTxHashes.has(tx.txHash)
      );
      
      // Update pending clicks count based on pending click transactions
      const pendingClickCount = filteredPendingTxs.filter(tx => tx.type === 'Click').length;
      setPendingClicks(pendingClickCount);
      
      // Combine pending and confirmed transactions
      const combinedTxs = [...filteredPendingTxs, ...confirmedTxs];
      
      // Only keep the most recent 20 transactions to avoid clutter
      const limitedTxs = combinedTxs.slice(0, 20);
      
      // Update transaction list
      setTransactions(limitedTxs);
    } catch (error) {
      errorTracker.add(error, "Fetching transaction history");
    } finally {
      setIsLoadingTransactions(false);
    }
  }, [mainWallet.provider, gasWallet.address, transactions, networkStatus]);
  
  // Remove cookies after animation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (cookies.length > 0) {
        setCookies(prev => prev.slice(1));
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [cookies]);
  
  // Periodic data refresh - rate-limited for browser performance
  useEffect(() => {
    if (mainWallet.provider && mainWallet.address && gasWallet.address) {
      // Initial load - stagger them to avoid bursts of requests
      const initialLoadTimeout = setTimeout(() => loadUserData(true), 1000);
      const initialTxTimeout = setTimeout(() => fetchTransactionHistory(), 3000);
      
      // Setup refresh intervals
      const dataInterval = setInterval(() => {
        if (networkStatus === 'online') {
          loadUserData();
        }
      }, DATA_REFRESH_INTERVAL);
      
      // Setup transaction history refresh interval (less frequent)
      const txInterval = setInterval(() => {
        if (networkStatus === 'online') {
          fetchTransactionHistory();
        }
      }, TX_HISTORY_REFRESH_INTERVAL);
      
      return () => {
        clearTimeout(initialLoadTimeout);
        clearTimeout(initialTxTimeout);
        clearInterval(dataInterval);
        clearInterval(txInterval);
      };
    }
  }, [mainWallet.provider, mainWallet.address, gasWallet.address, loadUserData, fetchTransactionHistory, networkStatus, DATA_REFRESH_INTERVAL, TX_HISTORY_REFRESH_INTERVAL]);
  
  // Create a memoized context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    score,
    confirmedScore,
    pendingClicks,
    processingTxCount,
    cookieBalance,
    redeemableTokens,
    clicksPerToken,
    cookies,
    transactions,
    isLoadingTransactions,
    contractHasTokens,
    networkStatus,
    dataLoadError,
    handleClick,
    handleRedeem,
    loadUserData,
    fetchTransactionHistory,
    mainWallet,
    gasWallet,
    queueLength: txQueue.length,
    recentErrors: errorTracker.getRecent()
  }), [
    score,
    confirmedScore,
    pendingClicks,
    processingTxCount,
    cookieBalance,
    redeemableTokens,
    clicksPerToken,
    cookies,
    transactions,
    isLoadingTransactions,
    contractHasTokens,
    networkStatus,
    dataLoadError,
    handleClick,
    handleRedeem,
    loadUserData,
    fetchTransactionHistory,
    mainWallet,
    gasWallet,
    txQueue.length
  ]);
  
  return (
    <GameContext.Provider value={contextValue}>
      {children}
    </GameContext.Provider>
  );
};