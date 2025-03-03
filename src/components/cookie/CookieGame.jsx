// src/components/cookie/CookieGame.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useGameContext } from '../../context/GameContext';
import { useWalletContext } from '../../context/WalletContext';
import { useTransactionContext } from '../../context/TransactionContext';
import { AlertCircle, Clock, Activity, RefreshCw } from 'lucide-react';
import { fundClickerContract } from '../../services/TransactionService';

const CookieGame = () => {
  const { 
    confirmedScore,
    pendingClicks,
    cookieBalance,
    redeemableTokens,
    clicksPerToken,
    cookies,
    contractHasTokens,
    handleClick,
    handleRedeem,
    refreshTokenBalance // Add this to use the new refresh function
  } = useGameContext();
  
  const { mainWallet, gasWallet, loading } = useWalletContext();
  const { processingTxCount, transactions, queueLength } = useTransactionContext();
  
  // Redeem form state
  const [redeemAmount, setRedeemAmount] = useState(0);
  const [redeemMode, setRedeemMode] = useState('all'); // 'all' or 'custom'
  const [fundAmount, setFundAmount] = useState('10');
  const [showFundingForm, setShowFundingForm] = useState(false);
  const [buttonMessage, setButtonMessage] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Update redeem amount when clicksPerToken changes or when switching modes
  useEffect(() => {
    if (redeemMode === 'all') {
      // Set to 0 which means "redeem all eligible" in the contract
      setRedeemAmount(0);
    } else {
      // Start with minimum redeemable amount (clicksPerToken)
      setRedeemAmount(clicksPerToken);
    }
  }, [clicksPerToken, redeemMode]);
  
  // Check if there are pending redeem transactions
  const isRedeemPending = transactions.some(
    tx => tx.type === 'Redeem' && tx.status === 'pending'
  );
  
  // Handle cookie click
  const onClickHandler = useCallback((e) => {
    try {
      handleClick(e);
    } catch (error) {
      alert(error.message);
    }
  }, [handleClick]);
  
  // Handle redeem
  const onRedeemHandler = async () => {
    try {
      if (!contractHasTokens) {
        alert("Contract has no tokens to distribute. Please fund it first.");
        return;
      }
      
      // If redeeming a custom amount, ensure it's divisible by clicksPerToken
      if (redeemMode === 'custom' && redeemAmount % clicksPerToken !== 0) {
        alert(`Amount must be divisible by ${clicksPerToken}.`);
        return;
      }
      
      const amountToRedeem = redeemMode === 'all' ? 0 : redeemAmount;
      await handleRedeem(amountToRedeem);
    } catch (error) {
      alert(error.message);
    }
  };
  
  // Handle fund contract
  const onFundHandler = async () => {
    try {
      if (!mainWallet.signer) {
        alert("Please connect your wallet first");
        return;
      }
      
      const tx = await fundClickerContract(mainWallet.signer, fundAmount);
      await tx.wait();
      
      alert(`Successfully funded contract with ${fundAmount} $COOKIE tokens!`);
      setShowFundingForm(false);
      
      // Refresh token balance after funding
      refreshTokenBalance();
    } catch (error) {
      alert(`Failed to fund contract: ${error.message}`);
    }
  };
  
  // Handle manual token balance refresh
  const handleRefreshBalance = async () => {
    if (!mainWallet.connected || !gasWallet.address) return;
    
    setIsRefreshing(true);
    try {
      await refreshTokenBalance();
    } catch (error) {
      console.error("Error refreshing balance:", error);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };
  
  // Calculate maximum tokens user can redeem (based only on confirmed score)
  const maxTokens = Math.floor(confirmedScore / clicksPerToken);
  const maxRedeemableScore = maxTokens * clicksPerToken;
  
  // Update custom redeem amount when user changes the input
  const handleCustomAmountChange = (e) => {
    const value = parseInt(e.target.value) || 0;
    // Clamp the value between 0 and maximum redeemable (based on confirmed score)
    const clampedValue = Math.min(Math.max(0, value), confirmedScore);
    setRedeemAmount(clampedValue);
  };
  
  // Determine if the redeem button should be disabled
  const isRedeemDisabled = 
    !mainWallet.connected || 
    gasWallet.balance === "0" || 
    !contractHasTokens || 
    confirmedScore < clicksPerToken || 
    isRedeemPending;
    
  // Set an informative message for why the button is disabled
  useEffect(() => {
    if (!mainWallet.connected) {
      setButtonMessage('Connect wallet to redeem');
    } else if (gasWallet.balance === "0") {
      setButtonMessage('Gas wallet needs MON');
    } else if (!contractHasTokens) {
      setButtonMessage('Contract needs tokens');
    } else if (confirmedScore < clicksPerToken) {
      setButtonMessage(`Need at least ${clicksPerToken} points`);
    } else if (isRedeemPending) {
      setButtonMessage('Redemption in progress');
    } else {
      setButtonMessage('');
    }
  }, [mainWallet.connected, gasWallet.balance, contractHasTokens, confirmedScore, clicksPerToken, isRedeemPending]);
  
  // Determine if button should be disabled
  const isClickDisabled = 
    !mainWallet.connected || 
    gasWallet.balance === "0" || 
    processingTxCount >= 25;
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md mb-6">
      {/* Score Display */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center">
          <div className="bg-white rounded-lg px-3 py-2 shadow">
            <div className="text-2xl font-bold text-amber-800 flex items-center justify-center">
              <span>{confirmedScore} points</span>
              {pendingClicks > 0 && (
                <div className="ml-2 px-2 py-1 bg-yellow-100 rounded-full flex items-center text-sm text-yellow-700">
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin mr-1"></span>
                  +{pendingClicks} pending
                </div>
              )}
            </div>
            
            <div className="text-sm text-gray-500 flex items-center justify-center">
              $COOKIE Balance: {cookieBalance}
              <button 
                onClick={handleRefreshBalance}
                disabled={isRefreshing}
                className="ml-2 text-blue-500 hover:text-blue-700"
                title="Refresh token balance"
              >
                <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
              </button>
            </div>
            <div className="text-xs text-gray-400">
              You need {clicksPerToken} points for 1 $COOKIE token
            </div>
          </div>
        </div>
        
        {/* Queue Indicator */}
        {(processingTxCount > 0 || queueLength > 0) && (
          <div className="text-center mt-2">
            <div className="inline-flex items-center bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm">
              <Clock size={14} className="mr-1" />
              {processingTxCount > 0 && (
                <span className="mr-2">
                  {processingTxCount} processing
                </span>
              )}
              {queueLength > 0 && (
                <span>
                  {queueLength} in queue
                </span>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Cookie Button */}
      <div className="w-full mb-6">
        <div className="relative w-full h-64 bg-amber-100 rounded-lg flex items-center justify-center overflow-hidden">
          {mainWallet.loading && (
            <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center rounded-lg z-10">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          )}
          
          <button 
            onClick={onClickHandler}
            disabled={isClickDisabled}
            aria-label="Click the cookie"
            className={`transition-transform ${isClickDisabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-95 hover:shadow-xl'}`}
          >
            <div className="w-32 h-32 rounded-full bg-amber-300 border-4 border-amber-600 flex items-center justify-center shadow-lg transition-shadow">
              <div className="w-24 h-24 rounded-full bg-amber-400 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-amber-500 flex items-center justify-center text-3xl">
                  🍪
                </div>
              </div>
            </div>
          </button>
          
          {/* Cookie Animation */}
          {cookies.map(cookie => (
            <div 
              key={cookie.id}
              className="absolute text-3xl animate-bounce opacity-70"
              style={{
                left: cookie.x - 16,
                top: cookie.y - 16,
                animation: 'float 1s forwards'
              }}
            >
              🍪
            </div>
          ))}
        </div>
      </div>
      
      {/* Redeem Form */}
      <div className="bg-white rounded-lg shadow-lg p-4 w-full max-w-md mb-4">
        <h2 className="font-bold text-lg mb-2">Redeem Cookies for Tokens</h2>
        
        <div className="mb-4 text-sm">
          <div className="flex justify-between mb-1">
            <span>Current Score:</span>
            <span className="font-semibold">
              {confirmedScore} points
              {pendingClicks > 0 && (
                <span className="text-yellow-600 ml-1">
                  (+{pendingClicks} pending)
                </span>
              )}
            </span>
          </div>
          <div className="flex justify-between mb-1">
            <span>Token Balance:</span>
            <span className="font-semibold">{cookieBalance} $COOKIE</span>
          </div>
          <div className="flex justify-between mb-1">
            <span>Redeemable Tokens:</span>
            <span className="font-semibold">{maxTokens} $COOKIE</span>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Rate:</span>
            <span>{clicksPerToken} points = 1 $COOKIE</span>
          </div>
        </div>
        
        <div className="mb-4">
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setRedeemMode('all')}
              className={`px-3 py-1 text-sm rounded ${
                redeemMode === 'all' 
                  ? 'bg-amber-500 text-white' 
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              Redeem All
            </button>
            <button
              onClick={() => setRedeemMode('custom')}
              className={`px-3 py-1 text-sm rounded ${
                redeemMode === 'custom' 
                  ? 'bg-amber-500 text-white' 
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              Custom Amount
            </button>
          </div>
          
          {isRedeemPending && (
            <div className="mb-3 text-sm text-yellow-600 flex items-center">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin mr-1"></span>
              Redeem transaction pending...
            </div>
          )}
          
          {redeemMode === 'all' ? (
            <div className="mb-3 text-sm">
              Will redeem <span className="font-semibold">{maxRedeemableScore} points</span> for 
              <span className="font-semibold"> {maxTokens} $COOKIE</span> tokens
              
              {pendingClicks > 0 && (
                <div className="mt-1 text-xs text-yellow-600">
                  <AlertCircle size={14} className="inline mr-1" />
                  Only confirmed score can be redeemed ({confirmedScore} points)
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-3">
              <input
                type="number"
                min={clicksPerToken}
                max={confirmedScore}
                step={clicksPerToken}
                value={redeemAmount}
                onChange={handleCustomAmountChange}
                className="border border-gray-300 rounded px-2 py-1 w-20 text-center"
              />
              <span className="text-sm">
                points for {Math.floor(redeemAmount / clicksPerToken)} $COOKIE
              </span>
            </div>
          )}
          
          <button
            onClick={onRedeemHandler}
            disabled={isRedeemDisabled}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white px-4 py-2 rounded flex items-center justify-center"
          >
            {isRedeemPending ? (
              <>
                <span className="inline-block w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2"></span>
                Processing...
              </>
            ) : (
              "Redeem for $COOKIE"
            )}
          </button>
          
          {buttonMessage && (
            <div className="mt-2 text-xs text-amber-600 text-center">
              {buttonMessage}
            </div>
          )}
        </div>
        
        {!contractHasTokens && mainWallet.connected && (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-2 rounded mb-2">
              <AlertCircle size={16} />
              <span>
                The contract has no tokens to distribute. Fund it with $COOKIE tokens to enable redemption.
              </span>
            </div>
            
            {!showFundingForm ? (
              <button 
                onClick={() => setShowFundingForm(true)}
                className="text-blue-600 text-sm underline"
              >
                Fund contract with tokens
              </button>
            ) : (
              <div className="border border-gray-200 rounded p-2 bg-gray-50">
                <div className="text-sm font-bold mb-1">Fund Contract</div>
                <div className="flex items-center space-x-2">
                  <input 
                    type="number" 
                    min="1"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 w-20 text-center"
                  />
                  <button 
                    onClick={onFundHandler}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
                  >
                    Fund
                  </button>
                  <button 
                    onClick={() => setShowFundingForm(false)}
                    className="text-gray-500 text-sm"
                  >
                    Cancel
                  </button>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  You'll need to approve token transfer in your wallet
                </div>
              </div>
            )}
          </div>
        )}
        
        {(!mainWallet.connected || gasWallet.balance === "0") && (
          <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-2 rounded">
            <AlertCircle size={16} />
            <span>
              {!mainWallet.connected 
                ? "Connect wallet to start playing" 
                : "Fund gas wallet with MON to enable clicking"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CookieGame;