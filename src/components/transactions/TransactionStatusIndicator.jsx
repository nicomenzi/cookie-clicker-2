// src/components/transactions/TransactionStatusIndicator.jsx
import React from 'react';
import { useGameContext } from '../../context/GameContext';
import { Activity, Check, Clock, X } from 'lucide-react';

const TransactionStatusIndicator = () => {
  const { transactions, processingTxCount } = useGameContext();
  
  // Don't show if there are no transactions or none are pending
  if (!transactions.length || !transactions.some(tx => tx.status === 'pending')) {
    return null;
  }
  
  // Count transactions by type and status
  const stats = transactions.reduce((acc, tx) => {
    if (tx.status === 'pending') {
      acc.pendingCount++;
      
      if (tx.txHash) {
        acc.processingCount++;
      } else {
        acc.queuedCount++;
      }
      
      if (tx.type === 'Click') {
        acc.pendingClicks++;
      } else if (tx.type === 'Redeem') {
        acc.pendingRedeems++;
      }
    }
    
    return acc;
  }, { 
    pendingCount: 0,
    processingCount: 0, 
    queuedCount: 0,
    pendingClicks: 0,
    pendingRedeems: 0
  });
  
  // If nothing is pending, don't show
  if (stats.pendingCount === 0) {
    return null;
  }
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-white rounded-lg shadow-lg p-2 max-w-xs">
        <div className="font-bold text-sm flex items-center mb-1">
          <Activity size={16} className="text-blue-500 mr-1" />
          Transaction Status
        </div>
        
        {stats.processingCount > 0 && (
          <div className="flex items-center text-xs text-blue-600 mb-1">
            <span className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin mr-1"></span>
            {stats.processingCount} transaction{stats.processingCount > 1 ? 's' : ''} processing
          </div>
        )}
        
        {stats.queuedCount > 0 && (
          <div className="flex items-center text-xs text-yellow-600 mb-1">
            <Clock size={12} className="mr-1" />
            {stats.queuedCount} transaction{stats.queuedCount > 1 ? 's' : ''} queued
          </div>
        )}
        
        {stats.pendingClicks > 0 && (
          <div className="flex items-center text-xs text-green-600">
            <span className="w-2 h-2 rounded-full bg-green-500 mr-1"></span>
            {stats.pendingClicks} click{stats.pendingClicks > 1 ? 's' : ''} pending
          </div>
        )}
        
        {stats.pendingRedeems > 0 && (
          <div className="flex items-center text-xs text-amber-600">
            <span className="w-2 h-2 rounded-full bg-amber-500 mr-1"></span>
            {stats.pendingRedeems} redeem{stats.pendingRedeems > 1 ? 's' : ''} pending
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionStatusIndicator;