// src/context/GameContext.jsx - extreme request reduction
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
import requestCoordinator from '../services/RequestCoordinator';

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
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(0);
  const [dataLoadError, setDataLoadError] = useState(null);
  const [networkStatus, setNetworkStatus] = useState('online');
  
  // Refs to track processing state without re-renders
  const processingRef = useRef(false);
  const txQueueRef = useRef([]);
  const processingCountRef = useRef(0);
  const lastTxUpdateRef = useRef(0);
  
  // Keep refs in sync with state - this avoids re-renders triggering effects
  useEffect(() => {
    txQueueRef.current = txQueue;
    processingCountRef.current = processingTxCount;
  }, [txQueue, processingTxCount]);
  
  // Constants
  const MAX_CONCURRENT_TX = 25; 
  const MAX_QUEUE_LENGTH = 100;
  const MIN_REFRESH_INTERVAL = 60 * 1000; // 1 minute (was 30s)
  
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
      
      // Mark that we just updated transactions so background fetches can be skipped
      lastTxUpdateRef.current = Date.now();
      requestCoordinator.registerUserActivity();
      
      return [pendingTx, ...prev.slice(0, 19)]; // Keep last 20
    });
    
    return txId;
  }, []);

  // Update transaction status
  const updateTransaction = useCallback((txId, details) => {
    setTransactions(prev => {
      // Mark that we just updated transactions so background fetches can be skipped
      lastTxUpdateRef.current = Date.now();
      requestCoordinator.registerUserActivity();
      
      return prev.map(tx => 
        tx.id === txId ? { ...tx, ...details } : tx
      );
    });
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
      
      // Update calculated redeemable tokens immediately without API call
      const newPendingClicks = pendingClicks + 1;
      const totalScore = confirmedScore + newPendingClicks;
      // Only update UI for new full tokens earned
      const newRedeemableTokens = Math.floor(totalScore / clicksPerToken);
      requestCoordinator.setCachedData('redeemableTokens', newRedeemableTokens.toString(), gasWallet.address);
      
      // Register user activity
      requestCoordinator.registerUserActivity();
    } catch (error) {
      alert(error.message);
    }
  }, [
    mainWallet.connected, 
    gasWallet.instance, 
    gasWallet.balance,
    gasWallet.address,
    addPendingTransaction,
    networkStatus,
    MAX_QUEUE_LENGTH,
    pendingClicks,
    confirmedScore,
    clicksPerToken
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
    
    // Clear all related caches to ensure fresh data after redeeming
    requestCoordinator.clearCachedData('playerScore');
    requestCoordinator.clearCachedData('redeemableTokens');
    requestCoordinator.clearCachedData('cookieBalance');
    
    // Register user activity
    requestCoordinator.registerUserActivity();
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
        
        // Update caches
        const newScore = confirmedScore + 1;
        requestCoordinator.setCachedData('playerScore', newScore, gasWallet.address);
        const newRedeemableTokens = Math.floor(newScore / clicksPerToken);
        requestCoordinator.setCachedData('redeemableTokens', newRedeemableTokens.toString(), gasWallet.address);
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
        // This is important for redeem as it changes multiple states
        setTimeout(() => loadUserData(true), 5000);
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

  // Optimized transaction processing
  useEffect(() => {
    if (networkStatus === 'offline' || !gasWallet.instance) return;
    
    let timeoutId = null;
    
    // Non-recursive transaction processor
    const processNextTransaction = () => {
      // Clear any existing timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      // Don't process when document is hidden
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        timeoutId = setTimeout(processNextTransaction, 1000);
        return;
      }
      
      // Get current queue state
      const currentQueue = txQueueRef.current;
      
      if (currentQueue.length === 0) {
        // No transactions to process, check again later
        timeoutId = setTimeout(processNextTransaction, 500);
        return;
      }
      
      // Process multiple transactions at once with controlled parallelism
      const availableSlots = MAX_CONCURRENT_TX - processingCountRef.current;
      
      if (availableSlots <= 0) {
        // We're at capacity, wait and check again
        timeoutId = setTimeout(processNextTransaction, 100);
        return;
      }
      
      // Process up to 3 transactions at a time (was 5)
      const transactionsToProcess = Math.min(availableSlots, currentQueue.length, 3);
      
      // Get the transactions to process
      const transactions = currentQueue.slice(0, transactionsToProcess);
      
      // Remove from queue
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
      
      // Schedule next batch processing
      timeoutId = setTimeout(processNextTransaction, 200);
    };
    
    // Start the processor
    timeoutId = setTimeout(processNextTransaction, 100);
    
    // Cleanup
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [gasWallet.instance, networkStatus, MAX_CONCURRENT_TX]);
  
  // Load user data with extreme optimization
  const loadUserData = useCallback(async (forceRefresh = false) => {
    // Skip if offline or no wallet connection
    if (networkStatus === 'offline' || !mainWallet.provider || !gasWallet.address) return;
    
    try {
      // Register activity if this is a forced refresh
      if (forceRefresh) requestCoordinator.registerUserActivity();
      
      // Check with coordinator if we should refresh player score
      if (!requestCoordinator.shouldRefresh('playerScore', forceRefresh)) {
        // Use cached player score if available
        const cachedScore = requestCoordinator.getCachedData('playerScore', gasWallet.address);
        if (cachedScore !== undefined) {
          setConfirmedScore(cachedScore);
        }
        // Skip API call
        console.log("Skipping playerScore API call - using cache");
      } else {
        // Fetch player score from blockchain
        console.log("Fetching playerScore from blockchain");
        setDataLoadError(null);
        
        try {
          const clickerContract = getCookieClickerContract(mainWallet.provider);
          const playerScore = await clickerContract.getScore(gasWallet.address);
          const score = playerScore.toNumber();
          
          // Update state and cache
          setConfirmedScore(score);
          requestCoordinator.setCachedData('playerScore', score, gasWallet.address);
          
          // Also update redeemable tokens based on this score (avoid separate API call)
          const redeemable = Math.floor(score / clicksPerToken);
          setRedeemableTokens(redeemable.toString());
          requestCoordinator.setCachedData('redeemableTokens', redeemable.toString(), gasWallet.address);
        } catch (error) {
          errorTracker.add(error, "Getting player score");
        }
      }
            
      // Only refresh less critical data on forced refresh or very infrequently
      if (forceRefresh || requestCoordinator.shouldRefresh('contractConfig', false)) {
        try {
          const clickerContract = getCookieClickerContract(mainWallet.provider);
          
          // Batch fetch contract configuration
          const [clicksPerTokenRes, hasTokensRes] = await Promise.all([
            clickerContract.clicksPerToken().catch(e => {
              errorTracker.add(e, "Getting clicks per token");
              return ethers.BigNumber.from(clicksPerToken);
            }),
            
            clickerContract.getContractBalance().catch(e => {
              errorTracker.add(e, "Checking contract tokens");
              return ethers.BigNumber.from(contractHasTokens ? 1 : 0);
            })
          ]);
          
          // Update state
          setClicksPerToken(clicksPerTokenRes.toNumber());
          setContractHasTokens(!hasTokensRes.isZero());
          
          // Cache contract config
          requestCoordinator.setCachedData('clicksPerToken', clicksPerTokenRes.toNumber());
          requestCoordinator.setCachedData('contractHasTokens', !hasTokensRes.isZero());
          
          // Update redeemable tokens again if clicks per token changed
          const newRedeemable = Math.floor(confirmedScore / clicksPerTokenRes.toNumber());
          if (newRedeemable.toString() !== redeemableTokens) {
            setRedeemableTokens(newRedeemable.toString());
            requestCoordinator.setCachedData('redeemableTokens', newRedeemable.toString(), gasWallet.address);
          }
        } catch (error) {
          errorTracker.add(error, "Loading contract config");
        }
      }
      
      // Only fetch token balance on forced refresh or very infrequently
      if (forceRefresh || requestCoordinator.shouldRefresh('cookieBalance', false)) {
        try {
          const tokenContract = getCookieTokenContract(mainWallet.provider);
          const decimals = await tokenContract.decimals().catch(() => 18);
          const balance = await tokenContract.balanceOf(gasWallet.address);
          const formattedBalance = ethers.utils.formatUnits(balance, decimals);
          
          // Update state and cache
          setCookieBalance(formattedBalance);
          requestCoordinator.setCachedData('cookieBalance', formattedBalance, gasWallet.address);
        } catch (error) {
          errorTracker.add(error, "Loading token balance");
        }
      }
      
      // Set last refresh time
      setLastRefresh(Date.now());
      
    } catch (error) {
      errorTracker.add(error, "Loading user data");
      setDataLoadError("Failed to load game data. Will retry soon.");
    }
  }, [
    mainWallet.provider, 
    gasWallet.address, 
    networkStatus, 
    confirmedScore, 
    clicksPerToken, 
    contractHasTokens, 
    redeemableTokens
  ]);

  // Fetch transaction history with extreme optimization
  const fetchTransactionHistory = useCallback(async (forceRefresh = false) => {
    // Skip if offline or no wallet connection
    if (networkStatus === 'offline' || !mainWallet.provider || !gasWallet.address) return;
    
    // Skip if we've recently updated transactions manually and this isn't a forced refresh
    // or if the coordinator says we shouldn't refresh
    if ((!forceRefresh && Date.now() - lastTxUpdateRef.current < 60000) || 
        !requestCoordinator.shouldRefresh('transactionHistory', forceRefresh)) {
      console.log("Skipping transaction history fetch - too recent or not needed");
      return;
    }
    
    // Don't show loading indicator if we already have transactions
    if (transactions.length === 0) {
      setIsLoadingTransactions(true);
    }
    
    try {
      console.log("Fetching transaction history from blockchain");
      
      // Reduce block count when we already have transaction history
      const blockCount = transactions.length > 0 ? 50 : 100;
      
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
      
      // Only keep the most recent 20 transactions
      const limitedTxs = combinedTxs.slice(0, 20);
      
      // Update transaction list
      setTransactions(limitedTxs);
      
      // Remember that we just updated
      lastTxUpdateRef.current = Date.now();
      requestCoordinator.recordRefresh('transactionHistory');
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
  
  // Periodic data refresh with extreme reduction
  useEffect(() => {
    if (mainWallet.provider && mainWallet.address && gasWallet.address) {
      // Initial load - stagger them to avoid bursts of requests
      // Longer delays for initial load to give browser time to stabilize
      const initialLoadTimeout = setTimeout(() => loadUserData(true), 2000);
      const initialTxTimeout = setTimeout(() => fetchTransactionHistory(true), 5000);
      
      // Create a single consolidated refresh function
      const refreshAllData = () => {
        // Don't refresh when tab is hidden
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          return;
        }
        
        // Always load user data first
        const now = Date.now();
        if (now - lastRefresh >= MIN_REFRESH_INTERVAL) {
          loadUserData(false);
          
          // Then load transaction history with a delay
          setTimeout(() => {
            fetchTransactionHistory(false);
          }, 1000); // 1 second delay between calls
        }
      };
      
      // Single refresh interval - much longer
      const refreshInterval = setInterval(refreshAllData, 2 * 60 * 1000); // 2 minutes
      
      // Visibility change handler - only load when becoming visible
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          // When tab becomes visible again, do a refresh if it's been a while
          const now = Date.now();
          if (now - lastRefresh > MIN_REFRESH_INTERVAL) {
            // Delay refresh slightly to let browser stabilize
            setTimeout(() => loadUserData(false), 1000);
            setTimeout(() => fetchTransactionHistory(false), 3000);
          }
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      return () => {
        clearTimeout(initialLoadTimeout);
        clearTimeout(initialTxTimeout);
        clearInterval(refreshInterval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [
    mainWallet.provider, 
    mainWallet.address, 
    gasWallet.address, 
    loadUserData, 
    fetchTransactionHistory,
    lastRefresh,
    MIN_REFRESH_INTERVAL
  ]);
  
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