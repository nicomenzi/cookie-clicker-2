// src/components/wallet/GasWalletIndicator.jsx
import React from 'react';
import { useWalletContext } from '../../context/WalletContext';
import { AlertTriangle, AlertCircle } from 'lucide-react';
import { ethers } from 'ethers';

const GasWalletIndicator = () => {
  const { gasWallet } = useWalletContext();
  
  if (!gasWallet.address || !gasWallet.balance) {
    return null;
  }
  
  // Check if balance is zero
  if (gasWallet.balance === "0") {
    return (
      <div className="fixed bottom-20 left-4 z-50">
        <div className="bg-red-100 text-red-700 px-4 py-2 rounded-lg shadow-lg max-w-xs">
          <div className="flex items-center font-bold mb-1">
            <AlertTriangle size={16} className="mr-2" />
            Gas Wallet Empty!
          </div>
          <div className="text-sm">
            Your gas wallet needs MON to process transactions. Please fund it using the "Fund" button in the gas wallet section.
          </div>
        </div>
      </div>
    );
  }
  
  // Check if balance is low (less than 0.01 MON)
  const balanceNumber = parseFloat(gasWallet.balance);
  if (balanceNumber < 0.01) {
    return (
      <div className="fixed bottom-20 left-4 z-50">
        <div className="bg-yellow-100 text-yellow-700 px-4 py-2 rounded-lg shadow-lg max-w-xs">
          <div className="flex items-center font-bold mb-1">
            <AlertCircle size={16} className="mr-2" />
            Gas Wallet Low!
          </div>
          <div className="text-sm">
            Your gas wallet is running low on MON ({gasWallet.balance}). Consider funding it soon.
          </div>
        </div>
      </div>
    );
  }
  
  return null;
};

export default GasWalletIndicator;