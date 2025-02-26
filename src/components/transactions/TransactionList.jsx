// src/components/transactions/TransactionList.jsx
import React from 'react';
import { useGameContext } from '../../context/GameContext';
import TransactionItem from './TransactionItem';

const TransactionList = () => {
  const { transactions } = useGameContext();
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-4 w-full max-w-md mb-6">
      <h2 className="font-bold text-lg mb-2">Recent Transactions</h2>
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