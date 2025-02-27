// src/components/common/RateLimitNotice.jsx
import React, { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

const RateLimitNotice = () => {
  const [show, setShow] = useState(true);
  
  // Hide the notice after 30 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShow(false);
    }, 30000);
    
    return () => clearTimeout(timer);
  }, []);
  
  if (!show) return null;
  
  return (
    <div className="fixed top-20 right-4 z-50 max-w-xs bg-yellow-50 border border-yellow-200 rounded-lg p-3 shadow-lg">
      <button 
        onClick={() => setShow(false)}
        className="absolute top-1 right-1 text-gray-400 hover:text-gray-600"
        aria-label="Close notice"
      >
        <X size={16} />
      </button>
      
      <div className="flex items-start mb-2">
        <AlertTriangle size={18} className="text-yellow-600 mr-2 mt-0.5" />
        <h3 className="font-bold text-yellow-700">Alchemy API Rate Limits</h3>
      </div>
      
      <p className="text-sm text-yellow-700 mb-2">
        Alchemy may enforce rate limits on the API. If you click too fast, 
        some transactions might be delayed or queued.
      </p>
      
      <p className="text-xs text-yellow-600">
        This game now uses a rate-limited queue to manage transactions within these limits.
      </p>
    </div>
  );
};

export default RateLimitNotice;