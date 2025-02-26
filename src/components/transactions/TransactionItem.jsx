// src/components/transactions/TransactionItem.jsx
import React from 'react';
import { CheckCircle, XCircle, Clock, Activity, Link } from 'lucide-react';

const TransactionItem = ({ transaction: tx }) => {
  const getBgColor = () => {
    switch (tx.status) {
      case 'pending': return tx.txHash ? 'border-blue-100 bg-blue-50' : 'border-yellow-100 bg-yellow-50';
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
        return tx.txHash ? (
          <Activity size={16} className="text-blue-500 animate-pulse" />
        ) : (
          <Clock size={16} className="text-yellow-500" />
        );
      case 'confirmed': 
        return <CheckCircle size={16} className="text-green-500" />;
      case 'failed': 
        return <XCircle size={16} className="text-red-500" />;
      default: 
        return null;
    }
  };
  
  const getStatusText = () => {
    switch (tx.status) {
      case 'pending':
        return tx.txHash ? 'Processing' : 'Queued';
      case 'confirmed':
        return 'Confirmed';
      case 'failed':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };
  
  const getStatusColor = () => {
    switch (tx.status) {
      case 'pending': 
        return tx.txHash ? 'text-blue-600' : 'text-yellow-600';
      case 'confirmed': 
        return 'text-green-600';
      case 'failed': 
        return 'text-red-600';
      default: 
        return 'text-gray-500';
    }
  };
  
  const getTxHashDisplay = () => {
    if (tx.txHash) {
      return (
        <div className="flex items-center">
          <span className="truncate max-w-[140px]">
            TX: {tx.txHash.slice(0, 6)}...{tx.txHash.slice(-4)}
          </span>
          <a 
            href={`https://testnet.monadexplorer.com/tx/${tx.txHash}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="ml-1 text-blue-500 hover:text-blue-700"
          >
            <Link size={12} />
          </a>
        </div>
      );
    }
    
    return 'Waiting for submission...';
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
  
  // Loading animation for processing transactions
  const loadingAnimation = tx.status === 'pending' && tx.txHash && (
    <div className="absolute right-2 top-2">
      <span className="inline-block w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin"></span>
    </div>
  );
  
  return (
    <div className={`border-b pb-2 text-sm ${getBgColor()} p-2 rounded relative`}>
      {loadingAnimation}
      
      <div className="flex justify-between">
        <div className={`${getTypeColor()} flex items-center`}>
          {getStatusIcon()}
          <span className="ml-1">{tx.type}</span>
        </div>
        <span className="text-gray-500 text-xs">{tx.timestamp}</span>
      </div>
      
      <div className="flex justify-between text-xs mt-1">
        <span className={getStatusColor()}>
          {getStatusText()}
        </span>
        {getValueDisplay()}
      </div>
      
      <div className="text-xs text-gray-500 mt-1">
        {getTxHashDisplay()}
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