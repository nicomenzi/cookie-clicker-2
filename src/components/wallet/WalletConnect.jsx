// src/components/wallet/WalletConnect.jsx
import React from 'react';
import { useWalletContext } from '../../context/WalletContext';

const WalletConnect = () => {
  const { mainWallet, loading, connectMainWallet } = useWalletContext();
  
  const handleConnect = async () => {
    try {
      await connectMainWallet();
    } catch (error) {
      alert(`Failed to connect wallet: ${error.message}`);
    }
  };
  
  return (
    <div className="fixed top-4 right-4 flex flex-col items-end">
      {mainWallet.connected ? (
        <div className="bg-green-100 border border-green-300 rounded p-2 mb-2 text-xs text-green-800">
          Connected: {mainWallet.address.slice(0, 6)}...{mainWallet.address.slice(-4)}
        </div>
      ) : (
        <button 
          onClick={handleConnect} 
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2 rounded">
          Connect Wallet
        </button>
      )}
    </div>
  );
};

export default WalletConnect;

