// src/components/cookie/ScoreDisplay.jsx
import React from 'react';
import { useGameContext } from '../../context/GameContext';

const ScoreDisplay = () => {
  const { 
    confirmedScore, 
    pendingClicks, 
    cookieBalance, 
    clicksPerToken,
    processingTxCount 
  } = useGameContext();
  
  const totalScore = confirmedScore + pendingClicks;
  
  return (
    <div className="text-center mb-6">
      <div className="text-2xl font-bold text-amber-800 flex items-center justify-center">
        <span>Score: {confirmedScore} points</span>
        {pendingClicks > 0 && (
          <div className="ml-2 px-2 py-1 bg-yellow-100 rounded-full flex items-center text-sm text-yellow-700">
            <span className="inline-block w-3 h-3 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin mr-1"></span>
            +{pendingClicks} pending
          </div>
        )}
      </div>
      
      <div className="text-sm text-gray-500">$COOKIE Balance: {cookieBalance}</div>
      <div className="text-xs text-gray-400">
        You need {clicksPerToken} clicks for 1 $COOKIE token
      </div>
      
      {processingTxCount > 0 && (
        <div className="mt-2 text-xs text-blue-600">
          Processing {processingTxCount} transaction{processingTxCount > 1 ? 's' : ''}...
        </div>
      )}
    </div>
  );
};

export default ScoreDisplay;