// src/components/cookie/RedeemForm.jsx
import React, { useState, useEffect } from 'react';
import { useWalletContext } from '../../context/WalletContext';
import { useGameContext } from '../../context/GameContext';
import { AlertCircle } from 'lucide-react';
import { fundClickerContract } from '../../services/blockchain';

const RedeemForm = () => {
  const { mainWallet, gasWallet } = useWalletContext();
  const { 
    score, 
    cookieBalance, 
    redeemableTokens,
    clicksPerToken, 
    contractHasTokens,
    handleRedeem 
  } = useGameContext();
  
  const [redeemAmount, setRedeemAmount] = useState(0);
  const [redeemMode, setRedeemMode] = useState('all'); // 'all' or 'custom'
  const [fundAmount, setFundAmount] = useState('10');
  const [showFundingForm, setShowFundingForm] = useState(false);

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
    } catch (error) {
      alert(`Failed to fund contract: ${error.message}`);
    }
  };
  
  // Calculate maximum tokens user can redeem
  const maxTokens = Math.floor(score / clicksPerToken);
  const maxRedeemableScore = maxTokens * clicksPerToken;
  
  // Update custom redeem amount when user changes the input
  const handleCustomAmountChange = (e) => {
    const value = parseInt(e.target.value) || 0;
    // Clamp the value between 0 and maximum redeemable
    const clampedValue = Math.min(Math.max(0, value), score);
    setRedeemAmount(clampedValue);
  };
  
  // Determine if the redeem button should be disabled
  const isRedeemDisabled = 
    !mainWallet.connected || 
    gasWallet.balance === "0" || 
    !contractHasTokens || 
    redeemableTokens === "0" || 
    (redeemMode === 'custom' && redeemAmount < clicksPerToken);
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-4 w-full max-w-md mb-4">
      <h2 className="font-bold text-lg mb-2">Redeem Cookies for Tokens</h2>
      
      <div className="mb-4 text-sm">
        <div className="flex justify-between mb-1">
          <span>Current Score:</span>
          <span className="font-semibold">{score} points</span>
        </div>
        <div className="flex justify-between mb-1">
          <span>Token Balance:</span>
          <span className="font-semibold">{cookieBalance} $COOKIE</span>
        </div>
        <div className="flex justify-between mb-1">
          <span>Redeemable Tokens:</span>
          <span className="font-semibold">{redeemableTokens} $COOKIE</span>
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
        
        {redeemMode === 'all' ? (
          <div className="mb-3 text-sm">
            Will redeem <span className="font-semibold">{maxRedeemableScore} points</span> for 
            <span className="font-semibold"> {maxTokens} $COOKIE</span> tokens
          </div>
        ) : (
          <div className="flex items-center gap-2 mb-3">
            <input
              type="number"
              min={clicksPerToken}
              max={score}
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
          className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white px-4 py-2 rounded"
        >
          Redeem for $COOKIE
        </button>
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
  );
};

export default RedeemForm;