// src/components/common/QueueIndicator.jsx
import React from 'react';
import { useGameContext } from '../../context/GameContext';
import { Clock } from 'lucide-react';

const QueueIndicator = () => {
  const { queueLength, processingTxCount } = useGameContext();
  
  // Only show when there are items in the queue
  if (queueLength === 0 && processingTxCount === 0) {
    return null;
  }
  
  return (
    <div className="text-center mb-2">
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
  );
};

export default QueueIndicator;