// src/components/transactions/TransactionManager.jsx
import React, { useMemo } from 'react';
import { useTransactionContext } from '../../context/TransactionContext';
import { useWalletContext } from '../../context/WalletContext';
import { CheckCircle, XCircle, Clock, Activity, Link, RefreshCw, AlertCircle } from 'lucide-react';

const TransactionManager = () => {
  const { 
    transactions, 
    processingTxCount, 
    isLoadingTransactions,
    hasInitiallyLoaded,
    loadError,
    queueLength,
    fetchTransactionHistory
  } = useTransactionContext();
  
  const { mainWallet, gasWallet } = useWalletContext();
  
  // Count pending transactions by type
  const pendingCounts = useMemo(() => {
    return transactions.reduce((acc, tx) => {
      if (tx.status === 'pending') {
        acc.total++;
        acc[tx.type] = (acc[tx.type] || 0) + 1;
      }
      return acc;
    }, { total: 0 });
  }, [transactions]);
  
  // Only show "no transactions" if wallet is connected, we've successfully loaded data, 
  // and we're not currently loading
  const isConnectedWithNoTransactions = 
    mainWallet.connected && 
    gasWallet.address && 
    transactions.length === 0 && 
    !isLoadingTransactions &&
    hasInitiallyLoaded;
  
  // Handle manual refresh
  const handleManualRefresh = () => {
    if (mainWallet.provider && gasWallet.address) {
      fetchTransactionHistory();
    }
  };

  // Render the transaction list
  const renderTransactionList = () => (
    <div className="bg-white rounded-lg shadow-lg p-4 w-full max-w-md mb-6">
      <div className="flex justify-between items-center mb-2">
        <h2 className="font-bold text-lg">Recent Transactions</h2>
        
        <div className="flex items-center">
          {pendingCounts.total > 0 && (
            <div className="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded-full flex items-center mr-2">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin mr-1"></span>
              {pendingCounts.total} pending
            </div>
          )}
          
          <button 
            onClick={handleManualRefresh}
            disabled={!mainWallet.connected || isLoadingTransactions}
            className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
            title="Refresh transactions"
          >
            <RefreshCw size={16} className={isLoadingTransactions ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      
      {/* Loading indicator overlay - shows alongside existing transactions */}
      {isLoadingTransactions && (
        <div className="bg-blue-50 rounded p-2 mb-2 flex items-center">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full mr-2"></div>
          <div className="text-xs text-blue-600">
            {transactions.length > 0 
              ? "Refreshing transaction history..." 
              : "Loading transaction history..."}
          </div>
        </div>
      )}
      
      {/* Show load error if any */}
      {loadError && (
        <div className="bg-red-50 rounded p-2 mb-2 flex items-center">
          <AlertCircle size={16} className="text-red-500 mr-2" />
          <div className="text-xs text-red-600">
            {loadError}
          </div>
        </div>
      )}
      
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
      
      {isConnectedWithNoTransactions && (
        <div className="text-gray-500 text-sm text-center py-4">
          No transactions found for this wallet.
          <br />
          Start clicking to earn cookies!
        </div>
      )}
      
      {transactions.length > 0 && (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <TransactionItem key={tx.id || tx.txHash || Math.random().toString(36).substring(2)} transaction={tx} />
          ))}
        </div>
      )}
      
      {!mainWallet.connected && !isLoadingTransactions && (
        <div className="text-gray-500 text-sm text-center py-4">
          Connect your wallet to see transaction history
        </div>
      )}
      
      {mainWallet.connected && !hasInitiallyLoaded && !isLoadingTransactions && (
        <div className="text-gray-500 text-sm text-center py-4">
          Click the refresh button to load your transactions
        </div>
      )}
    </div>
  );
  
  // Render the transaction status indicator
  const renderTransactionStatusIndicator = () => {
    // Don't show if there are no pending transactions
    if (!pendingCounts.total) return null;
    
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-white rounded-lg shadow-lg p-2 max-w-xs">
          <div className="font-bold text-sm flex items-center mb-1">
            <Activity size={16} className="text-blue-500 mr-1" />
            Transaction Status
          </div>
          
          {processingTxCount > 0 && (
            <div className="flex items-center text-xs text-blue-600 mb-1">
              <span className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin mr-1"></span>
              {processingTxCount} transaction{processingTxCount > 1 ? 's' : ''} processing
            </div>
          )}
          
          {queueLength > 0 && (
            <div className="flex items-center text-xs text-yellow-600 mb-1">
              <Clock size={12} className="mr-1" />
              {queueLength} transaction{queueLength > 1 ? 's' : ''} queued
            </div>
          )}
          
          {pendingCounts.Click > 0 && (
            <div className="flex items-center text-xs text-green-600">
              <span className="w-2 h-2 rounded-full bg-green-500 mr-1"></span>
              {pendingCounts.Click} click{pendingCounts.Click > 1 ? 's' : ''} pending
            </div>
          )}
          
          {pendingCounts.Redeem > 0 && (
            <div className="flex items-center text-xs text-amber-600">
              <span className="w-2 h-2 rounded-full bg-amber-500 mr-1"></span>
              {pendingCounts.Redeem} redeem{pendingCounts.Redeem > 1 ? 's' : ''} pending
            </div>
          )}
        </div>
      </div>
    );
  };
  
  return (
    <>
      {renderTransactionList()}
      {renderTransactionStatusIndicator()}
    </>
  );
};

// Individual transaction item component
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

export default TransactionManager;