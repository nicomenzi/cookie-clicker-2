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
    
    // Update score immediately for better UX
    setScore(prev => prev + 1);
  };
  
  
  // Handle redeem tokens
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
    
    // If amount is 0, the contract will redeem all eligible points
    // If amount is set, ensure it's divisible by clicksPerToken
    let pointsToRedeem = amount;
    if (amount > 0) {
      // Make sure amount is divisible by clicksPerToken
      if (amount % clicksPerToken !== 0) {
        throw new Error(`Amount must be divisible by ${clicksPerToken}`);
      }
      
      // Check if player has enough score
      if (score < amount) {
        throw new Error(`Not enough points! You need at least ${amount} points.`);
      }
    } else {
      // Calculate maximum redeemable points
      pointsToRedeem = Math.floor(score / clicksPerToken) * clicksPerToken;
      
      if (pointsToRedeem === 0) {
        throw new Error(`You need at least ${clicksPerToken} points to redeem for 1 token.`);
      }
    }
    
    // Calculate tokens to receive
    const tokensToReceive = pointsToRedeem / clicksPerToken;
    
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
    
    // Update score immediately for better UX
    setScore(prev => prev - pointsToRedeem);
  };
  
  // Add a pending transaction to history
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
  
  // Update transaction when confirmed or failed
  const updateTransaction = (txId, details) => {
    setTransactions(prev => 
      prev.map(tx => 
        tx.id === txId ? { ...tx, ...details } : tx
      )
    );
  };
  
  // Process transaction queue
  useEffect(() => {
    const processQueue = async () => {
      // If already processing or queue is empty, do nothing
      if (processingTx || txQueue.length === 0 || !gasWallet.instance) return;
      
      // Mark as processing to prevent concurrent calls
      setProcessingTx(true);
      
      try {
        // Get the next transaction from the queue
        const nextTx = txQueue[0];
        
        // Remove it from the queue
        setTxQueue(prev => prev.slice(1));
        
        // Process based on transaction type
        if (nextTx.type === 'Click') {
          try {
            // Send transaction using gas wallet
            const response = await recordClick(gasWallet.instance);
            
            // Update transaction in history with hash but still pending
            updateTransaction(nextTx.id, {
              txHash: response.hash
            });
            
            // Wait for transaction to be mined
            await response.wait();
            
            // Update transaction in history as confirmed
            updateTransaction(nextTx.id, {
              status: 'confirmed'
            });
          } catch (error) {
            console.error("Error clicking cookie:", error);
            
            // Update transaction as failed
            updateTransaction(nextTx.id, {
              status: 'failed',
              error: error.message
            });
            
            // Revert the score update
            setScore(prev => Math.max(0, prev - 1));
          }
        } else if (nextTx.type === 'BatchClick') {
          try {
            // Send batch transaction using gas wallet
            
            // Update transaction in history with hash but still pending
            updateTransaction(nextTx.id, {
              txHash: response.hash
            });
            
            // Wait for transaction to be mined
            await response.wait();
            
            // Update transaction in history as confirmed
            updateTransaction(nextTx.id, {
              status: 'confirmed'
            });
          } catch (error) {
            console.error("Error batch clicking cookies:", error);
            
            // Update transaction as failed
            updateTransaction(nextTx.id, {
              status: 'failed',
              error: error.message
            });
            
            // Revert the score update
            setScore(prev => Math.max(0, prev - nextTx.batchSize));
          }
        } else if (nextTx.type === 'Redeem') {
          try {
            // Send transaction using gas wallet
            const response = await redeemCookies(gasWallet.instance, nextTx.amount);
            
            // Update transaction in history with hash but still pending
            updateTransaction(nextTx.id, {
              txHash: response.hash
            });
            
            // Wait for transaction to be mined
            await response.wait();
            
            // Update transaction in history as confirmed
            updateTransaction(nextTx.id, {
              status: 'confirmed'
            });
            
            // Reload user data after redeeming
            await loadUserData();
          } catch (error) {
            console.error("Error redeeming tokens:", error);
            
            // Update transaction as failed
            updateTransaction(nextTx.id, {
              status: 'failed',
              error: error.message
            });
            
            // Revert the score update
            setScore(prev => prev + nextTx.amount);
          }
        }
      } catch (error) {
        console.error("Error processing transaction queue:", error);
        
        // If there was a nonce error, reset the nonce
        if (error.message && (error.message.includes("nonce") || error.message.includes("replacement transaction underpriced"))) {
          try {
            if (gasWallet.instance && mainWallet.provider) {
              gasWallet.instance.currentNonce = await mainWallet.provider.getTransactionCount(gasWallet.instance.getAddress());
              console.log("Reset nonce to", gasWallet.instance.currentNonce);
            }
          } catch (nonceError) {
            console.error("Error resetting nonce:", nonceError);
          }
        }
      } finally {
        setProcessingTx(false);
      }
    };
    
    processQueue();
  }, [txQueue, processingTx, gasWallet.instance, mainWallet.provider, clicksPerToken]);
  
  // Load user data (score and token balance)
  const loadUserData = async () => {
    try {
      if (!mainWallet.provider || !gasWallet.address) return;
      
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
        setScore(score);
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
      
      // Fetch transaction history from the chain
      try {
        const onchainTxs = await fetchTransactionHistory(mainWallet.provider, gasWallet.address);
        
        // Merge with our pending transactions
        // Keep all pending transactions
        const pendingTxs = transactions.filter(tx => tx.status === 'pending');
        
        // Add confirmed transactions from the chain that aren't already tracked
        const knownTxHashes = new Set(transactions.map(tx => tx.txHash).filter(Boolean));
        const newOnchainTxs = onchainTxs.filter(tx => !knownTxHashes.has(tx.txHash));
        
        // Update transaction list if needed
        if (newOnchainTxs.length > 0) {
          setTransactions(prev => [
            ...pendingTxs, 
            ...newOnchainTxs, 
            ...prev.filter(tx => 
              tx.status !== 'pending' && 
              !newOnchainTxs.some(newTx => newTx.txHash === tx.txHash)
            )
          ].slice(0, 20)); // Keep only the most recent 20
        }
      } catch (error) {
        console.error("Error fetching transaction history:", error);
      }
    } catch (error) {
      console.error("Error loading user data:", error);
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
  
  // Load transaction history from localStorage
  useEffect(() => {
    if (mainWallet.address) {
      const storageKey = `monad_tx_history_${mainWallet.address.toLowerCase()}`;
      const storedTx = localStorage.getItem(storageKey);
      if (storedTx) {
        try {
          const parsedTx = JSON.parse(storedTx);
          setTransactions(parsedTx);
        } catch (error) {
          console.error("Error parsing stored transactions:", error);
        }
      }
    }
  }, [mainWallet.address]);
  
  // Save transaction history to localStorage
  useEffect(() => {
    if (mainWallet.address && transactions.length > 0) {
      const storageKey = `monad_tx_history_${mainWallet.address.toLowerCase()}`;
      localStorage.setItem(storageKey, JSON.stringify(transactions));
    }
  }, [transactions, mainWallet.address]);
  
  // Periodically reload user data
  useEffect(() => {
    if (mainWallet.provider && mainWallet.address) {
      loadUserData();
      
      const interval = setInterval(() => {
        loadUserData();
      }, 10000); // Reload every 10 seconds
      
      return () => clearInterval(interval);
    }
  }, [mainWallet.provider, mainWallet.address, gasWallet.address]);
  
  return (
    <GameContext.Provider value={{
      score,
      cookieBalance,
      redeemableTokens,
      clicksPerToken,
      cookies,
      transactions,
      contractHasTokens,
      handleClick,
      handleRedeem,
      loadUserData,
    }}>
      {children}
    </GameContext.Provider>
  );
};