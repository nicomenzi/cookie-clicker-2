// src/App.jsx
import React from 'react';
import { WalletProvider } from './context/WalletContext';
import { GameProvider } from './context/GameContext';
import WalletConnect from './components/wallet/WalletConnect';
import GasWallet from './components/wallet/GasWallet';
import CookieButton from './components/cookie/CookieButton';
import ScoreDisplay from './components/cookie/ScoreDisplay';
import RedeemForm from './components/cookie/RedeemForm';
import TransactionList from './components/transactions/TransactionList';
import TransactionStatusIndicator from './components/transactions/TransactionStatusIndicator';
import { COOKIE_TOKEN_ADDRESS, COOKIE_CLICKER_ADDRESS } from './constants/contracts';

const App = () => {
  return (
    <WalletProvider>
      <GameProvider>
        <div className="flex flex-col items-center min-h-screen bg-amber-50 p-4">
          <WalletConnect />

          <h1 className="text-4xl font-bold text-amber-800 mt-8">Blockchain Cookie Clicker</h1>
          <p className="text-amber-600 mb-2">Each click is verified on Monad blockchain</p>
          
          <GasWallet />
          
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md mb-6">
            <ScoreDisplay />
            <CookieButton />
            <RedeemForm />
          </div>
          
          <TransactionList />
          
          <div className="text-xs text-gray-500 mt-4 text-center">
            <p>Running on Monad EVM Blockchain</p>
            <p>$COOKIE Token Contract: {COOKIE_TOKEN_ADDRESS}</p>
            <p>Cookie Clicker Contract: {COOKIE_CLICKER_ADDRESS}</p>
          </div>
          
          {/* Fixed position transaction status indicator */}
          <TransactionStatusIndicator />
        </div>
      </GameProvider>
    </WalletProvider>
  );
};

export default App;