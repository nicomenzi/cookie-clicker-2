// src/components/cookie/CookieButton.jsx
import React from 'react';
import { useWalletContext } from '../../context/WalletContext';
import { useGameContext } from '../../context/GameContext';
import CookieAnimation from './CookieAnimation';

const CookieButton = () => {
  const { mainWallet, gasWallet, loading } = useWalletContext();
  const { cookies, handleClick } = useGameContext();
  
  const onClickHandler = (e) => {
    try {
      handleClick(e);
    } catch (error) {
      alert(error.message);
    }
  };
  
  const isDisabled = !mainWallet.connected || gasWallet.balance === "0" || loading;
  
  return (
    <div className="w-full mb-6">
      <div className="relative w-full h-64 bg-amber-100 rounded-lg flex items-center justify-center">
        {loading && (
          <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center rounded-lg">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}
        
        <button 
          onClick={onClickHandler}
          disabled={isDisabled}
          className="transition-transform active:scale-95 disabled:opacity-50"
        >
          <div className="w-32 h-32 rounded-full bg-amber-300 border-4 border-amber-600 flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow">
            <div className="w-24 h-24 rounded-full bg-amber-400 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-amber-500 flex items-center justify-center text-3xl">
                🍪
              </div>
            </div>
          </div>
        </button>
        
        <CookieAnimation cookies={cookies} />
      </div>
    </div>
  );
};

export default CookieButton;