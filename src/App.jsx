// src/App.jsx
import React, { useEffect } from 'react';
import { WalletProvider } from './context/WalletContext';
import { GameProvider } from './context/GameContext';
import WalletConnect from './components/wallet/WalletConnect';
import GasWallet from './components/wallet/GasWallet';
import CookieButton from './components/cookie/CookieButton';
import ScoreDisplay from './components/cookie/ScoreDisplay';
import RedeemForm from './components/cookie/RedeemForm';
import TransactionList from './components/transactions/TransactionList';
import TransactionStatusIndicator from './components/transactions/TransactionStatusIndicator';
import NetworkStatusIndicator from './components/common/NetworkStatusIndicator';
import GasWalletIndicator from './components/wallet/GasWalletIndicator';
import RateLimitNotice from './components/common/RateLimitNotice';
import ErrorBoundary from './components/common/ErrorBoundary';
import { COOKIE_TOKEN_ADDRESS, COOKIE_CLICKER_ADDRESS } from './constants/contracts';

// Security headers setup
const setupSecurityHeaders = () => {
  // This would typically be done on the server, but we're adding it here for completeness
  
  // Set Content Security Policy meta tag
  const cspMeta = document.createElement('meta');
  cspMeta.httpEquiv = 'Content-Security-Policy';
  cspMeta.content = "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://testnet-rpc.monad.xyz/ https://monad-testnet.g.alchemy.com/ https://testnet.monadexplorer.com/; img-src 'self' data:; object-src 'none';";
  document.head.appendChild(cspMeta);
  
  // Set other security headers via meta tags
  const headers = [
    { httpEquiv: 'X-Content-Type-Options', content: 'nosniff' },
    { httpEquiv: 'X-Frame-Options', content: 'DENY' },
    { httpEquiv: 'X-XSS-Protection', content: '1; mode=block' },
    { httpEquiv: 'Referrer-Policy', content: 'strict-origin-when-cross-origin' }
  ];
  
  headers.forEach(header => {
    const meta = document.createElement('meta');
    meta.httpEquiv = header.httpEquiv;
    meta.content = header.content;
    document.head.appendChild(meta);
  });
};

const App = () => {
  // Setup security headers on mount
  useEffect(() => {
    setupSecurityHeaders();
  }, []);
  
  return (
    <ErrorBoundary 
      fallbackMessage="Something went wrong with the application. Please reload the page." 
      showReload={true}
      debug={process.env.NODE_ENV === 'development'}
    >
      <WalletProvider>
        <GameProvider>
          <div className="flex flex-col items-center min-h-screen bg-amber-50 p-4">
            <WalletConnect />

            <h1 className="text-4xl font-bold text-amber-800 mt-8">Blockchain Cookie Clicker</h1>
            <p className="text-amber-600 mb-2">Each click is verified on Monad blockchain</p>
            
            {/* Added previously missing RateLimitNotice */}
            <ErrorBoundary fallbackMessage="Failed to load rate limit notice">
              <RateLimitNotice />
            </ErrorBoundary>
            
            <ErrorBoundary fallbackMessage="Failed to load wallet information">
              <GasWallet />
            </ErrorBoundary>
            
            <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md mb-6">
              <ErrorBoundary fallbackMessage="Failed to load game score">
                <ScoreDisplay />
              </ErrorBoundary>
              
              <ErrorBoundary fallbackMessage="Failed to load cookie button. Please reload the page.">
                <CookieButton />
              </ErrorBoundary>
              
              <ErrorBoundary fallbackMessage="Failed to load redemption form">
                <RedeemForm />
              </ErrorBoundary>
            </div>
            
            <ErrorBoundary fallbackMessage="Failed to load transaction history">
              <TransactionList />
            </ErrorBoundary>
            
            <div className="text-xs text-gray-500 mt-4 text-center">
              <p>Running on Monad EVM Blockchain via Alchemy</p>
              <p className="mt-1">
                Game Version: 1.3.0 (Optimized & Bugfixed)
              </p>
              <p className="mt-1">
                <span className="font-mono">
                  $COOKIE: {COOKIE_TOKEN_ADDRESS.slice(0, 6)}...{COOKIE_TOKEN_ADDRESS.slice(-4)}
                </span>
              </p>
              <p>
                <span className="font-mono">
                  Clicker: {COOKIE_CLICKER_ADDRESS.slice(0, 6)}...{COOKIE_CLICKER_ADDRESS.slice(-4)}
                </span>
              </p>
            </div>
            
            {/* Status indicators - Added missing GasWalletIndicator */}
            <TransactionStatusIndicator />
            <NetworkStatusIndicator />
            <GasWalletIndicator />
          </div>
        </GameProvider>
      </WalletProvider>
    </ErrorBoundary>
  );
};

export default App;