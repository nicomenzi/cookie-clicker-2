// src/components/cookie/ScoreDisplay.jsx
import React from 'react';
import { useGameContext } from '../../context/GameContext';
import { AlertCircle, Clock, Activity } from 'lucide-react';
import QueueIndicator from '../common/QueueIndicator';

const ScoreDisplay = () => {
  const { 
    confirmedScore, 
    pendingClicks, 
    cookieBalance, 
    clicksPerToken,
    processingTxCount,
    transactions
  } = useGameContext();
  
  // Determine pending transactions state
  const pendingTxs = transactions.filter(tx => tx.status === 'pending');
  const processingTxs = pendingTxs.filter(tx => tx.txHash); // Transactions with hash are in process
  
  // Get counts for different transaction types
  const pendingClickTxs = pendingTxs.filter(tx => tx.type === 'Click').length;
  const pendingRedeemTxs = pendingTxs.filter(tx => tx.type === 'Redeem').length;
  
  return (
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
          
          <div className="text-sm text-gray-500">$COOKIE Balance: {cookieBalance}</div>
          <div className="text-xs text-gray-400">
            You need {clicksPerToken} points for 1 $COOKIE token
          </div>
        </div>
      </div>
      
      {/* Queue Indicator */}
      <QueueIndicator />
      
      {/* Transaction Status Indicators */}
      {(processingTxCount > 0 || pendingTxs.length > 0) && (
        <div className="mt-3 flex flex-col items-center">
          {/* Processing Transaction Indicator */}
          {processingTxCount > 0 && (
            <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs flex items-center mb-1">
              <Activity size={12} className="animate-pulse mr-1" />
              Processing {processingTxCount} transaction{processingTxCount > 1 ? 's' : ''}
            </div>
          )}
          
          {/* Pending Redeem Transactions */}
          {pendingRedeemTxs > 0 && (
            <div className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs flex items-center">
              <Clock size={12} className="mr-1" />
              {pendingRedeemTxs} redeem{pendingRedeemTxs > 1 ? 's' : ''} pending
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ScoreDisplay;