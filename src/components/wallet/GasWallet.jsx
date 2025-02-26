// src/components/wallet/GasWallet.jsx
import React, { useState } from 'react';
import { useWalletContext } from '../../context/WalletContext';
import { useGameContext } from '../../context/GameContext';

const GasWallet = () => {
  const { mainWallet, gasWallet, loading, fundGasWallet } = useWalletContext();
  const { transactions } = useGameContext();
  const [fundAmount, setFundAmount] = useState("0.01");
  
  const handleFund = async () => {
    try {
      const txHash = await fundGasWallet(fundAmount);
      
      // Add fund transaction to history
      const newTransaction = { 
        id: Date.now(),
        type: "Fund", 
        txHash: txHash, 
        amount: fundAmount + " MON", 
        timestamp: new Date().toLocaleTimeString(),
        status: 'confirmed'
      };
      
      // We're not directly modifying the transactions array here as it's managed by GameContext
      // In a real app, you'd have a method in GameContext to add such transactions
      
      alert(`Successfully funded gas wallet with ${fundAmount} MON`);
    } catch (error) {
      alert(`Failed to fund gas wallet: ${error.message}`);
    }
  };
  
  if (!mainWallet.connected) return null;
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-4 w-full max-w-md mb-4">
      <h2 className="font-bold text-lg mb-2">Persistent Gas Wallet</h2>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm">
          <div>Address: {gasWallet.address.slice(0, 6)}...{gasWallet.address.slice(-4)}</div>
          <div>Balance: {gasWallet.balance} MON</div>
        </div>
        <div className="flex items-center">
          <input 
            type="text" 
            value={fundAmount}
            onChange={(e) => setFundAmount(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 w-20 text-center mr-2"
          />
          <button 
            onClick={handleFund}
            disabled={loading}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-3 py-1 rounded text-sm"
          >
            Fund
          </button>
        </div>
      </div>
      <div className="text-xs text-gray-500">
        This wallet is automatically created and persists between sessions. Fund it with MON to automate transactions.
      </div>
    </div>
  );
};

export default GasWallet;