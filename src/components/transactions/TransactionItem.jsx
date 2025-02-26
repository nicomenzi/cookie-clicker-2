// src/components/transactions/TransactionItem.jsx
import React from 'react';

const TransactionItem = ({ transaction: tx }) => {
  const getBgColor = () => {
    switch (tx.status) {
      case 'pending': return 'border-yellow-100 bg-yellow-50';
      case 'confirmed': return 'border-green-100 bg-green-50';
      case 'failed': return 'border-red-100 bg-red-50';
      default: return 'border-gray-100';
    }
  };
  
  const getTypeColor = () => {
    switch (tx.type) {
      case 'Click': return 'text-green-600';
      case 'Redeem': return 'text-blue-600';
      case 'Fund': return 'text-purple-600';
      default: return 'text-gray-600';
    }
  };
  
  const getStatusIcon = () => {
    switch (tx.status) {
      case 'pending': 
        return <span className="inline-block w-4 h-4 ml-2 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin"></span>;
      case 'confirmed': 
        return <span className="inline-block w-4 h-4 ml-2 text-green-500">✓</span>;
      case 'failed': 
        return <span className="inline-block w-4 h-4 ml-2 text-red-500">✗</span>;
      default: 
        return null;
    }
  };
  
  const getTxHashDisplay = () => {
    if (tx.txHash) {
      return `TX: ${tx.txHash.slice(0, 6)}...${tx.txHash.slice(-4)}`;
    }
    
    switch (tx.status) {
      case 'pending': return 'Pending...';
      case 'failed': return 'Failed';
      default: return 'Processing...';
    }
  };
  
  const getStatusColor = () => {
    switch (tx.status) {
      case 'pending': return 'text-yellow-600';
      case 'confirmed': return 'text-green-600';
      case 'failed': return 'text-red-600';
      default: return 'text-gray-500';
    }
  };
  
  const getValueDisplay = () => {
    switch (tx.type) {
      case 'Click': 
        return <span className="text-green-600">+{tx.points} points</span>;
      case 'Redeem': 
        return (
          <span>
            <span className="text-red-600">{tx.points} points</span>
            {" → "}
            <span className="text-blue-600">+{tx.tokens} $COOKIE</span>
          </span>
        );
      case 'Fund':
        return <span className="text-purple-600">+{tx.amount}</span>;
      default:
        return null;
    }
  };
  
  return (
    <div className={`border-b pb-2 text-sm ${getBgColor()} p-2 rounded`}>
      <div className="flex justify-between">
        <span className={`${getTypeColor()} flex items-center`}>
          {tx.type} 
          {getStatusIcon()}
        </span>
        <span className="text-gray-500 text-xs">{tx.timestamp}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className={getStatusColor()}>
          {getTxHashDisplay()}
        </span>
        {getValueDisplay()}
      </div>
      {tx.status === 'failed' && tx.error && (
        <div className="text-red-500 text-xs mt-1">
          Error: {tx.error.substring(0, 50)}{tx.error.length > 50 ? '...' : ''}
        </div>
      )}
    </div>
  );
};

export default TransactionItem;