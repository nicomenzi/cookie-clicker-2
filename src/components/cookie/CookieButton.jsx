// src/components/cookie/CookieButton.jsx
import React, { useCallback, memo } from 'react';
import { useWalletContext } from '../../context/WalletContext';
import { useGameContext } from '../../context/GameContext';
import CookieAnimation from './CookieAnimation';

// Memoized CookieAnimation component to prevent unnecessary re-renders
const MemoizedCookieAnimation = memo(CookieAnimation);

const CookieButton = () => {
  const { mainWallet, gasWallet, loading } = useWalletContext();
  const { cookies, handleClick } = useGameContext();
  
  // Use useCallback to prevent function recreation on every render
  const onClickHandler = useCallback((e) => {
    try {
      handleClick(e);
    } catch (error) {
      // Use a more user-friendly error message
      const errorMsg = error.message || "Something went wrong";
      alert(errorMsg);
    }
  }, [handleClick]);
  
  // Determine if button should be disabled
  const isDisabled = 
    !mainWallet.connected || 
    gasWallet.balance === "0" || 
    loading;
  
  return (
    <div className="w-full mb-6">
      <div className="relative w-full h-64 bg-amber-100 rounded-lg flex items-center justify-center overflow-hidden">
        {loading && (
          <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center rounded-lg z-10">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}
        
        <button 
          onClick={onClickHandler}
          disabled={isDisabled}
          aria-label="Click the cookie"
          className={`transition-transform ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-95 hover:shadow-xl'}`}
        >
          <div className="w-32 h-32 rounded-full bg-amber-300 border-4 border-amber-600 flex items-center justify-center shadow-lg transition-shadow">
            <div className="w-24 h-24 rounded-full bg-amber-400 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-amber-500 flex items-center justify-center text-3xl">
                🍪
              </div>
            </div>
          </div>
        </button>
        
        {/* Using the memoized version to prevent unnecessary re-renders */}
        <MemoizedCookieAnimation cookies={cookies} />
      </div>
    </div>
  );
};

// Export a memoized version of the component
export default memo(CookieButton);