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
  const MIN_REFRESH_INTERVAL = 60 * 1000; // 1 minute
  
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
  const { addPendingTransaction, updateTransaction } = useTransactionContext();

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
          setTimeout(() => loadUserData(true), 1000);
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
          
          // Trigger data reload but with a delay to avoid rate limits
          setTimeout(() => loadUserData(true), 2000);
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
  
  // Load user data with optimization
  const loadUserData = useCallback(async (forceRefresh = false) => {
    // Skip if offline or no wallet connection
    if (networkStatus === 'offline' || !mainWallet.provider || !gasWallet.address) return;
    
    console.log("Loading user data from blockchain");
    
    try {
      // Fetch player score from blockchain
      try {
        console.log("Fetching player score for address:", gasWallet.address);
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
      
      // Fetch contract configuration
      try {
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
      } catch (error) {
        console.error("Error loading contract config:", error);
        errorTracker.add(error, "Loading contract config");
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
      
      // Set last refresh time
      setLastRefresh(Date.now());
      
    } catch (error) {
      console.error("Error loading user data:", error);
      errorTracker.add(error, "Loading user data");
      setDataLoadError("Failed to load game data. Will retry soon.");
    }
  }, [
    mainWallet.provider, 
    gasWallet.address, 
    networkStatus, 
    clicksPerToken
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
  
  // Periodic data refresh 
  useEffect(() => {
    if (mainWallet.provider && mainWallet.address && gasWallet.address) {
      console.log("Setting up periodic data refresh");
      
      // Initial load - immediately load user data
      let initialLoadDone = false;
      const initialLoadTimeout = setTimeout(() => {
        if (!initialLoadDone) {
          initialLoadDone = true;
          loadUserData(true);
        }
      }, 1000);
      
      // Periodic refresh with throttling
      let lastLoadTime = 0;
      const LOAD_COOLDOWN = 5000; // 5 seconds between loads minimum
      
      const refreshInterval = setInterval(() => {
        const now = Date.now();
        // Only refresh if enough time has passed AND tab is visible
        if (document.visibilityState === 'visible' && now - lastLoadTime > LOAD_COOLDOWN) {
          lastLoadTime = now;
          loadUserData(false);
        }
      }, 10000); // Try every 10 seconds, but respect cooldown
      
      // Visibility change handler - refresh when becoming visible
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          // When tab becomes visible again, do a refresh if it's been a while
          const now = Date.now();
          if (now - lastLoadTime > LOAD_COOLDOWN) {
            lastLoadTime = now;
            loadUserData(false);
          }
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      return () => {
        clearTimeout(initialLoadTimeout);
        clearInterval(refreshInterval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [
    mainWallet.provider, 
    mainWallet.address, 
    gasWallet.address
  ]);
  
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
    mainWallet,
    gasWallet
  ]);
  
  return (
    <GameContext.Provider value={contextValue}>
      {children}
    </GameContext.Provider>
  );
};