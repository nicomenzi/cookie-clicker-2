// src/components/cookie/ScoreDisplay.jsx
import React from 'react';
import { useGameContext } from '../../context/GameContext';

const ScoreDisplay = () => {
  const { score, cookieBalance, clicksPerToken } = useGameContext();
  
  return (
    <div className="text-center mb-6">
      <div className="text-2xl font-bold text-amber-800">Score: {score} points</div>
      <div className="text-sm text-gray-500">$COOKIE Balance: {cookieBalance}</div>
      <div className="text-xs text-gray-400">
        You need {clicksPerToken} clicks for 1 $COOKIE token
      </div>
    </div>
  );
};

export default ScoreDisplay;