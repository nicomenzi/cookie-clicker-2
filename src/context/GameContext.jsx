// src/context/GameContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import { useWalletContext } from './WalletContext';
import { TransactionContext, useTransactionContext } from './TransactionContext';
import { 
  getPlayerScore, 
  getRedeemableTokens, 
  getTokenBalance, 
  getClicksPerToken,
  checkContractHasTokens
} from '../services/ContractService';
import { recordClick, redeemCookies } from '../services/TransactionService';
import apiManager from '../services/ApiManager';

// Create error tracking module
const errorTracker = {
  errors: [],
  maxErrors: 10,
  
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
    
    console.error(`Error in ${context}: ${errorMsg}`);
  },
  
  // Get recent errors
  getRecent(count = 5) {
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
  const [contractHasTokens, setContractHasTokens] = useState(true);
  const [dataLoadError, setDataLoadError] = useState(null);
  const [networkStatus, setNetworkStatus] = useState('online');
  const [lastRefresh, setLastRefresh] = useState(0);
  
  // Constants
  const MIN_REFRESH_INTERVAL = 15 * 1000; // 15 seconds
  
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

  // Import useTransactionContext
  const { addPendingTransaction, updateTransaction, transactions } = useTransactionContext();

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
      
      // Create animation cookie
      const cookie = {
        id: Date.now(),
        x: e.clientX,
        y: e.clientY,
      };
      setCookies(prev => [...prev, cookie]);
      
      // Add a pending transaction to history
      const txId = addPendingTransaction('Click', { points: 1 });
      
      // Optimistic update of pending clicks count
      setPendingClicks(prev => prev + 1);
      
      try {
        // Send the transaction
        const response = await recordClick(gasWallet.instance);
        
        // Update transaction in history with hash
        updateTransaction(txId, {
          txHash: response.hash,
          status: 'processing'
        });
        
        // When transaction confirms, update confirmed score and decrease pending
        response.wait().then(() => {
          // Update transaction in history as confirmed
          updateTransaction(txId, {
            status: 'confirmed'
          });
          
          // Update game state
          setConfirmedScore(prev => prev + 1);
          setPendingClicks(prev => Math.max(0, prev - 1));
          
          // Force reload data after confirmed click 
          // Check if we need to update token balance too (e.g., if near redemption threshold)
          const newScore = confirmedScore + 1;
          const couldRedeemBefore = Math.floor(confirmedScore / clicksPerToken);
          const canRedeemNow = Math.floor(newScore / clicksPerToken);
          
          if (canRedeemNow > couldRedeemBefore) {
            // If we crossed a redemption threshold, refresh token balance too
            setTimeout(() => refreshTokenBalance(), 300);
          }
          
          setTimeout(() => loadUserData(true), 500);
        }).catch(error => {
          // On failure, update transaction and decrease pending clicks
          updateTransaction(txId, {
            status: 'failed',
            error: error.message
          });
          
          setPendingClicks(prev => Math.max(0, prev - 1));
          errorTracker.add(error, "Confirming click transaction");
        });
      } catch (error) {
        // Update transaction as failed
        updateTransaction(txId, {
          status: 'failed',
          error: error.message
        });
        
        // Decrease pending clicks
        setPendingClicks(prev => Math.max(0, prev - 1));
        
        throw error;
      }
    } catch (error) {
      errorTracker.add(error, "Handling click");
      alert(error.message);
    }
  }, [
    mainWallet.connected, 
    gasWallet.instance, 
    gasWallet.balance,
    gasWallet.address,
    networkStatus,
    confirmedScore,
    clicksPerToken,
    addPendingTransaction, 
    updateTransaction
  ]);

  // Handle redeeming cookies for tokens
  const handleRedeem = useCallback(async (amount = 0) => {
    try {
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
      
      try {
        // Send the redeem transaction
        const response = await redeemCookies(gasWallet.instance, amount);
        
        // Update transaction with hash
        updateTransaction(txId, {
          txHash: response.hash,
          status: 'processing'
        });
        
        // Wait for transaction to complete and refresh data
        response.wait().then(() => {
          // Update transaction as confirmed
          updateTransaction(txId, {
            status: 'confirmed'
          });
          
          // First refresh token balance immediately - this is the most important update
          refreshTokenBalance();
          
          // Then trigger a full data refresh 500ms later
          setTimeout(() => loadUserData(true), 500);
        }).catch(error => {
          // Update transaction as failed
          updateTransaction(txId, {
            status: 'failed',
            error: error.message
          });
          
          errorTracker.add(error, "Confirming redeem transaction");
        });
      } catch (error) {
        // Update transaction as failed
        updateTransaction(txId, {
          status: 'failed',
          error: error.message
        });
        
        throw error;
      }
    } catch (error) {
      errorTracker.add(error, "Handling redeem");
      throw error;
    }
  }, [
    mainWallet.connected, 
    gasWallet.instance, 
    gasWallet.balance, 
    contractHasTokens, 
    confirmedScore, 
    clicksPerToken, 
    networkStatus,
    addPendingTransaction,
    updateTransaction
  ]);
  
  // Force refresh token balance only (for after redemptions)
  const refreshTokenBalance = useCallback(async () => {
    if (!mainWallet.provider || !gasWallet.address) return;
    
    console.log("Explicitly refreshing token balance...");
    try {
      // Clear cache to force a fresh fetch
      apiManager.clearCache(`token-balance:${gasWallet.address}`);
      
      // Get fresh token balance
      const balance = await getTokenBalance(mainWallet.provider, gasWallet.address);
      console.log("Updated token balance:", balance);
      
      // Update state
      setCookieBalance(balance);
    } catch (error) {
      console.error("Error refreshing token balance:", error);
      errorTracker.add(error, "Refreshing token balance");
    }
  }, [mainWallet.provider, gasWallet.address]);
  
  // Load user data with optimization
  const loadUserData = useCallback(async (forceRefresh = false) => {
    // Skip if offline or no wallet connection
    if (networkStatus === 'offline' || !mainWallet.provider || !gasWallet.address) return;
    
    // Rate limit refreshes to avoid excessive API calls
    if (!forceRefresh && Date.now() - lastRefresh < MIN_REFRESH_INTERVAL) {
      return;
    }
    
    console.log("Loading user data from blockchain");
    setLastRefresh(Date.now());
    
    try {
      // Clear any existing data load error
      setDataLoadError(null);
      
      // Fetch player score and token balance with highest priority
      try {
        console.log("Fetching player score for address:", gasWallet.address);
        
        // Clear these specific caches to force a fresh fetch
        if (forceRefresh) {
          apiManager.clearCache(`player-score:${gasWallet.address}`);
          apiManager.clearCache(`token-balance:${gasWallet.address}`);
          apiManager.clearCache(`redeemable-tokens:${gasWallet.address}`);
        }
        
        // Get player score (this should be quick due to our updated API manager settings)
        const score = await getPlayerScore(mainWallet.provider, gasWallet.address);
        console.log("Received player score:", score);
        
        // Update state
        setConfirmedScore(score);
        
        // Calculate redeemable tokens based on this score
        const redeemable = Math.floor(score / clicksPerToken);
        setRedeemableTokens(redeemable.toString());
      } catch (error) {
        console.error("Error getting player score:", error);
        errorTracker.add(error, "Getting player score");
      }
      
      // Fetch token balance
      try {
        console.log("Fetching token balance for address:", gasWallet.address);
        const balance = await getTokenBalance(mainWallet.provider, gasWallet.address);
        console.log("Received token balance:", balance);
        
        // Update state
        setCookieBalance(balance);
      } catch (error) {
        console.error("Error loading token balance:", error);
        errorTracker.add(error, "Loading token balance");
      }
      
      // Fetch contract configuration (lower priority data that doesn't change often)
      try {
        // Only fetch contract config occasionally or when forced
        if (forceRefresh || !clicksPerToken || clicksPerToken === 0) {
          console.log("Fetching contract configuration");
          
          // Batch fetch contract configuration
          const [clicksPerTokenRes, hasTokens] = await Promise.all([
            getClicksPerToken(mainWallet.provider),
            checkContractHasTokens(mainWallet.provider)
          ]);
          
          console.log("Received contract configuration:", { 
            clicksPerToken: clicksPerTokenRes, 
            hasTokens 
          });
          
          // Update state
          setClicksPerToken(clicksPerTokenRes);
          setContractHasTokens(hasTokens);
        }
      } catch (error) {
        console.error("Error loading contract config:", error);
        errorTracker.add(error, "Loading contract config");
      }
      
    } catch (error) {
      console.error("Error loading user data:", error);
      errorTracker.add(error, "Loading user data");
      setDataLoadError("Failed to load game data. Will retry soon.");
    }
  }, [
    mainWallet.provider, 
    gasWallet.address, 
    networkStatus, 
    clicksPerToken,
    lastRefresh,
    MIN_REFRESH_INTERVAL
  ]);
  
  // Remove cookies after animation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (cookies.length > 0) {
        setCookies(prev => prev.slice(1));
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [cookies]);
  
  // Periodic data refresh - simplified to reduce API calls but still get updates
  useEffect(() => {
    if (mainWallet.provider && mainWallet.address && gasWallet.address) {
      console.log("Setting up periodic data refresh");
      
      // Initial load - immediately load user data
      loadUserData(true);
      
      // Use a single interval for all refreshes
      const refreshInterval = setInterval(() => {
        // Only refresh if tab is visible
        if (document.visibilityState === 'visible') {
          loadUserData(false);
        }
      }, 20000); // Check every 20 seconds
      
      // Additional full refresh for visibility changes
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          // When tab becomes visible again, do a full refresh
          loadUserData(true);
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      return () => {
        clearInterval(refreshInterval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [
    mainWallet.provider, 
    mainWallet.address, 
    gasWallet.address,
    loadUserData
  ]);
  
  // Force refresh after successful transactions
  useEffect(() => {
    if (!gasWallet.address) return;
    
    // Listen for confirmed transactions and refresh data
    const checkForConfirmedTransactions = () => {
      const confirmedTx = transactions.find(tx => 
        tx.status === 'confirmed' && 
        tx.timestamp && 
        (new Date().getTime() - new Date(tx.timestamp).getTime() < 10000) // Within last 10 seconds
      );
      
      if (confirmedTx) {
        // If we have a recently confirmed transaction, refresh data
        console.log("Transaction confirmed, refreshing data:", confirmedTx.type);
        
        // For redemptions, explicitly refresh token balance first
        if (confirmedTx.type === 'Redeem') {
          refreshTokenBalance();
          setTimeout(() => loadUserData(true), 300);
        } else {
          loadUserData(true);
        }
      }
    };
    
    // Set up a periodic check
    const intervalId = setInterval(checkForConfirmedTransactions, 5000);
    
    return () => clearInterval(intervalId);
  }, [gasWallet.address, loadUserData, refreshTokenBalance, transactions]);
  
  // Create a memoized context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    score,
    confirmedScore,
    pendingClicks,
    cookieBalance,
    redeemableTokens,
    clicksPerToken,
    cookies,
    contractHasTokens,
    networkStatus,
    dataLoadError,
    handleClick,
    handleRedeem,
    loadUserData,
    refreshTokenBalance,
    mainWallet,
    gasWallet,
    recentErrors: errorTracker.getRecent()
  }), [
    score,
    confirmedScore,
    pendingClicks,
    cookieBalance,
    redeemableTokens,
    clicksPerToken,
    cookies,
    contractHasTokens,
    networkStatus,
    dataLoadError,
    handleClick,
    handleRedeem,
    loadUserData,
    refreshTokenBalance,
    mainWallet,
    gasWallet
  ]);
  
  return (
    <GameContext.Provider value={contextValue}>
      {children}
    </GameContext.Provider>
  );
};