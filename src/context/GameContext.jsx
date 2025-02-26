// src/context/GameContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWalletContext } from './WalletContext';
import { 
  getCookieClickerContract, 
  getCookieTokenContract,
  recordClick,
  redeemCookies,
  fetchTransactionHistory,
  checkContractHasTokens,
  getPlayerScore,
  getRedeemableTokens
} from '../services/blockchain';

const GameContext = createContext();

export const useGameContext = () => useContext(GameContext);

export const GameProvider = ({ children }) => {
  const { mainWallet, gasWallet } = useWalletContext();
  
  const [score, setScore] = useState(0);
  const [cookieBalance, setCookieBalance] = useState('0');
  const [redeemableTokens, setRedeemableTokens] = useState('0');
  const [clicksPerToken, setClicksPerToken] = useState(10);
  const [cookies, setCookies] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [txQueue, setTxQueue] = useState([]);
  const [processingTx, setProcessingTx] = useState(false);
  const [contractHasTokens, setContractHasTokens] = useState(true);
  const [confirmedScore, setConfirmedScore] = useState(0);
  const [pendingClicks, setPendingClicks] = useState(0);
  const [processingTxCount, setProcessingTxCount] = useState(0);
  const MAX_CONCURRENT_TX = 5; // Allow up to 5 transactions to process simultaneously
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);

  // Handle cookie click
const handleClick = async (e) => {
  if (!mainWallet.connected) {
    throw new Error("Please connect your wallet first!");
  }
  
  if (!gasWallet.instance || gasWallet.balance === "0") {
    throw new Error("Please fund your gas wallet with MON first!");
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
  
  // Update pending clicks count
  setPendingClicks(prev => prev + 1);
};

const addPendingTransaction = (type, details) => {
    const txId = Date.now(); // Unique identifier
    const pendingTx = {
      id: txId,
      type,
      status: 'pending',
      timestamp: new Date().toLocaleTimeString(),
      ...details
    };
    
    setTransactions(prev => [pendingTx, ...prev.slice(0, 19)]); // Keep last 20
    return txId;
  };

  const updateTransaction = (txId, details) => {
    setTransactions(prev => 
      prev.map(tx => 
        tx.id === txId ? { ...tx, ...details } : tx
      )
    );
  };
  
  
  // Updated handleRedeem function in GameContext
const handleRedeem = async (amount = 0) => {
    if (!mainWallet.connected) {
      throw new Error("Please connect your wallet first!");
    }
    
    if (!gasWallet.instance || gasWallet.balance === "0") {
      throw new Error("Please fund your gas wallet with MON first!");
    }
    
    if (!contractHasTokens) {
      throw new Error("Contract has no tokens to distribute. Please fund it first.");
    }
    
    console.log("Starting redeem with amount:", amount);
    
    // Calculate how many points will be redeemed
    let pointsToRedeem = amount;
    if (amount === 0) {
      // Calculate redeemable points based on confirmed score
      pointsToRedeem = Math.floor(confirmedScore / clicksPerToken) * clicksPerToken;
    }
    
    // Safety check
    if (pointsToRedeem === 0) {
      throw new Error(`You need at least ${clicksPerToken} points to redeem for 1 token.`);
    }
    
    if (pointsToRedeem > confirmedScore) {
      throw new Error(`Not enough confirmed points! You need at least ${pointsToRedeem} points.`);
    }
    
    // Calculate tokens to receive
    const tokensToReceive = pointsToRedeem / clicksPerToken;
    
    console.log(`Redeeming ${pointsToRedeem} points for ${tokensToReceive} tokens`);
    
    // Add a pending transaction to history
    const txId = addPendingTransaction('Redeem', { 
      points: -pointsToRedeem, 
      tokens: tokensToReceive 
    });
    
    // Add to queue
    setTxQueue(prev => [...prev, { 
      type: 'Redeem', 
      id: txId, 
      amount: pointsToRedeem 
    }]);
  };
  
  // Process transaction queue
  useEffect(() => {
    const processQueue = async () => {
      // If queue is empty or no gas wallet, do nothing
      if (txQueue.length === 0 || !gasWallet.instance) return;
      
      // Process only if we haven't hit the maximum number of concurrent transactions
      if (processingTxCount >= MAX_CONCURRENT_TX) return;
      
      // Get the next transaction from the queue
      const nextTx = txQueue[0];
      
      // Remove it from the queue
      setTxQueue(prev => prev.slice(1));
      
      // Increment processing counter
      setProcessingTxCount(prev => prev + 1);
      
      // Process independently (don't await, let it run in parallel)
      processTransaction(nextTx).finally(() => {
        // Decrement processing counter when done
        setProcessingTxCount(prev => prev - 1);
      });
    };
    
    processQueue();
  }, [txQueue, processingTxCount, gasWallet.instance]);
  
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
        
        // Reload user data after redeeming
        await loadUserData();
      }
    } catch (error) {
      console.error("Error processing transaction:", error);
      
      // Try to reset nonce if needed
      if (error.message && (error.message.includes("nonce") || error.message.includes("replacement transaction underpriced"))) {
        try {
          if (gasWallet.instance && mainWallet.provider) {
            await gasWallet.instance.refreshNonce();
          }
        } catch (nonceError) {
          console.error("Error resetting nonce:", nonceError);
        }
      }
      
      // Update transaction status as failed
      if (tx.type === 'Click') {
        updateTransaction(tx.id, {
          status: 'failed',
          error: error.message
        });
        
        // Decrease pending clicks count
        setPendingClicks(prev => Math.max(0, prev - 1));
      } else if (tx.type === 'Redeem') {
        updateTransaction(tx.id, {
          status: 'failed',
          error: error.message
        });
      }
    }
  };

  // Load user data (score and token balance)
  // Updated loadUserData function in GameContext
  const loadUserData = async () => {
    try {
      if (!mainWallet.provider || !gasWallet.address) return;
      
      console.log("Loading user data...");
      
      // Get contract first to read configuration
      const clickerContract = getCookieClickerContract(mainWallet.provider);
      
      // Get clicks per token
      try {
        const clicksPerToken = await clickerContract.clicksPerToken();
        setClicksPerToken(clicksPerToken.toNumber());
      } catch (error) {
        console.error("Error getting clicksPerToken:", error);
      }
      
      // Get user score using the gas wallet address (not main wallet)
      try {
        const score = await getPlayerScore(mainWallet.provider, gasWallet.address);
        console.log("Player score from blockchain:", score);
        setConfirmedScore(score);
      } catch (error) {
        console.error("Error getting player score:", error);
      }
      
      // Get redeemable tokens
      try {
        const redeemable = await getRedeemableTokens(mainWallet.provider, gasWallet.address);
        setRedeemableTokens(redeemable);
      } catch (error) {
        console.error("Error getting redeemable tokens:", error);
      }
      
      // Get $COOKIE token balance
      try {
        const tokenContract = getCookieTokenContract(mainWallet.provider);
        const decimals = await tokenContract.decimals();
        
        // Get token balance for the gas wallet address
        const balance = await tokenContract.balanceOf(gasWallet.address);
        setCookieBalance(ethers.utils.formatUnits(balance, decimals));
      } catch (error) {
        console.error("Error getting token balance:", error);
      }
      
      // Check if contract has tokens
      try {
        const hasTokens = await checkContractHasTokens(mainWallet.provider);
        setContractHasTokens(hasTokens);
      } catch (error) {
        console.error("Error checking contract tokens:", error);
      }
      
      // Fetch transaction history from the blockchain
      await fetchTransactionHistory();
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  };

  const fetchTransactionHistory = async () => {
    if (!mainWallet.provider || !gasWallet.address) return;
    
    setIsLoadingTransactions(true);
    
    try {
      // Fetch confirmed transactions from blockchain
      // Only look back 500 blocks for better performance
      const confirmedTxs = await fetchTransactionsFromBlockchain(mainWallet.provider, gasWallet.address, 500);
      
      // Get pending transactions (ones in our local state that haven't been confirmed yet)
      const pendingTxs = transactions.filter(tx => tx.status === 'pending');
      
      // Filter out any pending transactions that match confirmed ones
      // (in case they were confirmed but our UI didn't update)
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
      console.error("Error fetching transaction history:", error);
    } finally {
      setIsLoadingTransactions(false);
    }
  };
  
  // Remove cookies after animation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (cookies.length > 0) {
        setCookies(prev => prev.slice(1));
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [cookies]);
  
  
  // Periodically reload user data
  useEffect(() => {
    if (mainWallet.provider && mainWallet.address) {
      loadUserData();
      
      const interval = setInterval(() => {
        loadUserData();
      }, 15000); // Reload every 15 seconds
      
      return () => clearInterval(interval);
    }
  }, [mainWallet.provider, mainWallet.address, gasWallet.address]);
  
  return (
    <GameContext.Provider value={{
      score, // Total score (confirmedScore + pendingClicks)
      confirmedScore, // Only blockchain-confirmed score
      pendingClicks, // Number of pending click transactions
      processingTxCount, // Number of transactions currently processing
      cookieBalance,
      redeemableTokens,
      clicksPerToken,
      cookies,
      transactions,
      isLoadingTransactions,
      contractHasTokens,
      handleClick,
      handleRedeem,
      loadUserData,
      fetchTransactionHistory,
      mainWallet, // Add this for TransactionList
      gasWallet, // Add this for TransactionList
    }}>
      {children}
    </GameContext.Provider>
  );
};