// src/components/wallet/WalletManager.jsx
import React, { useState } from 'react';
import { useWalletContext } from '../../context/WalletContext';
import { AlertTriangle, AlertCircle } from 'lucide-react';

const WalletManager = () => {
  const { mainWallet, gasWallet, loading, connectMainWallet, fundGasWallet } = useWalletContext();
  const [fundAmount, setFundAmount] = useState("0.01");
  
  const handleConnect = async () => {
    try {
      await connectMainWallet();
    } catch (error) {
      alert(`Failed to connect wallet: ${error.message}`);
    }
  };
  
  const handleFund = async () => {
    try {
      const txHash = await fundGasWallet(fundAmount);
      alert(`Successfully funded gas wallet with ${fundAmount} MON`);
    } catch (error) {
      alert(`Failed to fund gas wallet: ${error.message}`);
    }
  };
  
  // Wallet connection UI
  const renderWalletConnect = () => (
    <div className="fixed top-4 right-4 flex flex-col items-end z-10">
      {mainWallet.connected ? (
        <div className="bg-green-100 border border-green-300 rounded p-2 mb-2 text-xs text-green-800">
          Connected: {mainWallet.address.slice(0, 6)}...{mainWallet.address.slice(-4)}
        </div>
      ) : (
        <button 
          onClick={handleConnect} 
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2 rounded">
          {loading ? 'Connecting...' : 'Connect Wallet'}
        </button>
      )}
    </div>
  );
  
  // Gas wallet UI
  const renderGasWallet = () => {
    if (!mainWallet.connected) return null;
    
    return (
      <div className="bg-white rounded-lg shadow-lg p-4 w-full max-w-md mb-4">
        <h2 className="font-bold text-lg mb-2">Persistent Gas Wallet</h2>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm">
            <div>Address: {gasWallet.address.slice(0, 6)}...{gasWallet.address.slice(-4)}</div>
            <div className={`${parseFloat(gasWallet.balance) < 0.01 ? 'text-red-600 font-bold' : ''}`}>
              Balance: {gasWallet.balance} MON
            </div>
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
  
  // Wallet warnings
  const renderWalletWarnings = () => {
    // Only render warnings if wallet is connected
    if (!mainWallet.connected || !gasWallet.address) return null;
    
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
  
  return (
    <>
      {renderWalletConnect()}
      {renderGasWallet()}
      {renderWalletWarnings()}
    </>
  );
};

export default WalletManager;