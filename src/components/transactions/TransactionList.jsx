// src/components/transactions/TransactionList.jsx
import React from 'react';
import { useGameContext } from '../../context/GameContext';
import TransactionItem from './TransactionItem';

const TransactionList = () => {
  const { transactions, processingTxCount } = useGameContext();
  
  // Count pending transactions by type
  const pendingCounts = transactions.reduce((acc, tx) => {
    if (tx.status === 'pending') {
      acc.total++;
      acc[tx.type] = (acc[tx.type] || 0) + 1;
    }
    return acc;
  }, { total: 0 });
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-4 w-full max-w-md mb-6">
      <div className="flex justify-between items-center mb-2">
        <h2 className="font-bold text-lg">Recent Transactions</h2>
        
        {pendingCounts.total > 0 && (
          <div className="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded-full flex items-center">
            <span className="inline-block w-3 h-3 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin mr-1"></span>
            {pendingCounts.total} pending
          </div>
        )}
      </div>
      
      {processingTxCount > 0 && (
        <div className="bg-blue-50 rounded p-2 mb-2 flex items-center">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full mr-2"></div>
          <div className="text-xs text-blue-600">
            Processing {processingTxCount} transaction{processingTxCount > 1 ? 's' : ''} in parallel...
          </div>
        </div>
      )}
      
      {pendingCounts.Click > 0 && (
        <div className="bg-green-50 rounded p-2 mb-2 text-xs text-green-600">
          <span className="font-medium">{pendingCounts.Click} click{pendingCounts.Click > 1 ? 's' : ''}</span> pending confirmation
        </div>
      )}
      
      {pendingCounts.Redeem > 0 && (
        <div className="bg-blue-50 rounded p-2 mb-2 text-xs text-blue-600">
          <span className="font-medium">{pendingCounts.Redeem} redeem{pendingCounts.Redeem > 1 ? 's' : ''}</span> pending confirmation
        </div>
      )}
      
      {transactions.length === 0 ? (
        <div className="text-gray-500 text-sm">No transactions yet</div>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <TransactionItem key={tx.id} transaction={tx} />
          ))}
        </div>
      )}
    </div>
  );
};

export default TransactionList;