// src/components/common/NetworkStatusIndicator.jsx
import React from 'react';
import { useGameContext } from '../../context/GameContext';
import { WifiOff, AlertTriangle } from 'lucide-react';

const NetworkStatusIndicator = () => {
  const { networkStatus, dataLoadError } = useGameContext();
  
  if (networkStatus === 'online' && !dataLoadError) {
    return null; // Don't show anything when everything is normal
  }
  
  return (
    <div className="fixed bottom-4 left-4 z-50">
      <div className={`rounded-lg shadow-lg p-2 flex items-center ${
        networkStatus === 'offline' 
          ? 'bg-red-100 text-red-800' 
          : 'bg-amber-100 text-amber-800'
      }`}>
        {networkStatus === 'offline' ? (
          <>
            <WifiOff size={16} className="mr-2" />
            <span className="text-sm">You're offline. Waiting for connection...</span>
          </>
        ) : dataLoadError && (
          <>
            <AlertTriangle size={16} className="mr-2" />
            <span className="text-sm">{dataLoadError}</span>
          </>
        )}
      </div>
    </div>
  );
};

export default NetworkStatusIndicator;