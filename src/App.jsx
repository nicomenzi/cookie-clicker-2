// src/App.jsx
import React, { useEffect } from 'react';
import { WalletProvider } from './context/WalletContext';
import { GameProvider } from './context/GameContext';
import { TransactionProvider } from './context/TransactionContext';
import WalletManager from './components/wallet/WalletManager';
import CookieGame from './components/cookie/CookieGame';
import TransactionManager from './components/transactions/TransactionManager';
import NetworkStatusIndicator from './components/common/NetworkStatusIndicator';
import RateLimitNotice from './components/common/RateLimitNotice';
import ErrorBoundary from './components/common/ErrorBoundary';
import { COOKIE_TOKEN_ADDRESS, COOKIE_CLICKER_ADDRESS } from './constants/contracts';
import './styles/index.css';

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
        <TransactionProvider>
          <GameProvider>
            <div className="flex flex-col items-center min-h-screen bg-amber-50 p-4">
              <ErrorBoundary fallbackMessage="Failed to load wallet information">
                <WalletManager />
              </ErrorBoundary>

              <h1 className="text-4xl font-bold text-amber-800 mt-8">Blockchain Cookie Clicker</h1>
              <p className="text-amber-600 mb-2">Each click is verified on Monad blockchain</p>
              
              <ErrorBoundary fallbackMessage="Failed to load rate limit notice">
                <RateLimitNotice />
              </ErrorBoundary>
              
              <ErrorBoundary fallbackMessage="Failed to load game component">
                <CookieGame />
              </ErrorBoundary>
              
              <ErrorBoundary fallbackMessage="Failed to load transaction history">
                <TransactionManager />
              </ErrorBoundary>
              
              <div className="text-xs text-gray-500 mt-4 text-center">
                <p>Running on Monad EVM Blockchain via Alchemy</p>
                <p className="mt-1">
                  Game Version: 2.0.0 (Optimized & Streamlined)
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
              
              <NetworkStatusIndicator />
            </div>
          </GameProvider>
        </TransactionProvider>
      </WalletProvider>
    </ErrorBoundary>
  );
};

export default App;