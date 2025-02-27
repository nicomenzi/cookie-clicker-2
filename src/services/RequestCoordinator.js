// src/services/RequestCoordinator.js
/**
 * Global coordinator for API requests to drastically reduce background fetching
 */
class RequestCoordinator {
    constructor() {
      // Track last update time for each data type
      this.lastUpdated = new Map();
      
      // Default refresh intervals (very long to minimize requests)
      this.refreshIntervals = {
        playerScore: 1 * 60 * 1000,       // 1 minute
        redeemableTokens: 3 * 60 * 1000,  // 3 minutes
        cookieBalance: 2 * 60 * 1000,     // 2 minutes
        contractHasTokens: 5 * 60 * 1000, // 5 minutes
        clicksPerToken: 15 * 60 * 1000,   // 15 minutes
        transactionHistory: 2 * 60 * 1000 // 2 minutes
      };
      
      // Cache for data
      this.cache = new Map();
      
      // Inactivity tracking
      this.lastUserAction = Date.now();
      this.isUserActive = true;
      
      // Register user activity events
      if (typeof window !== 'undefined') {
        ['mousedown', 'keydown', 'touchstart', 'click'].forEach(event => {
          window.addEventListener(event, () => this.registerUserActivity());
        });
        
        // Check for inactivity every minute
        setInterval(() => this.checkInactivity(), 60000);
      }
    }
    
    /**
     * Register user activity
     */
    registerUserActivity() {
      this.lastUserAction = Date.now();
      this.isUserActive = true;
    }
    
    /**
     * Check for user inactivity
     */
    checkInactivity() {
      const inactiveTime = Date.now() - this.lastUserAction;
      // Mark as inactive after 2 minutes of no interaction
      if (inactiveTime > 2 * 60 * 1000) {
        this.isUserActive = false;
      }
    }
    
    /**
     * Check if a data type should be refreshed
     * @param {string} dataType - The data type to check
     * @param {boolean} [forceRefresh=false] - Force a refresh regardless of time
     * @returns {boolean} - True if data should be refreshed
     */
    shouldRefresh(dataType, forceRefresh = false) {
      // Always refresh if forced
      if (forceRefresh) return true;
      
      // When page is hidden, block almost all requests
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return false;
      }
      
      // If user is inactive, use much longer refresh intervals
      const inactivityMultiplier = this.isUserActive ? 1 : 5;
      
      // Get last update time
      const lastUpdate = this.lastUpdated.get(dataType) || 0;
      const now = Date.now();
      
      // Get refresh interval (with inactivity multiplier)
      const interval = (this.refreshIntervals[dataType] || 60000) * inactivityMultiplier;
      
      // Only refresh if enough time has passed
      return (now - lastUpdate) >= interval;
    }
    
    /**
     * Record a data refresh
     * @param {string} dataType - The data type that was refreshed
     */
    recordRefresh(dataType) {
      this.lastUpdated.set(dataType, Date.now());
    }
    
    /**
     * Get cached data
     * @param {string} dataType - The data type to get
     * @param {string} [key='default'] - Optional key for multiple entries of the same type
     * @returns {any} - The cached data or undefined if not found
     */
    getCachedData(dataType, key = 'default') {
      const fullKey = `${dataType}:${key}`;
      return this.cache.get(fullKey);
    }
    
    /**
     * Set cached data
     * @param {string} dataType - The data type to set
     * @param {any} data - The data to cache
     * @param {string} [key='default'] - Optional key for multiple entries of the same type
     */
    setCachedData(dataType, data, key = 'default') {
      const fullKey = `${dataType}:${key}`;
      this.cache.set(fullKey, data);
      this.recordRefresh(dataType);
    }
    
    /**
     * Clear cached data for a data type
     * @param {string} dataType - The data type to clear
     * @param {string} [key] - Optional specific key to clear
     */
    clearCachedData(dataType, key) {
      if (key) {
        const fullKey = `${dataType}:${key}`;
        this.cache.delete(fullKey);
      } else {
        // Clear all entries for this data type
        for (const cacheKey of this.cache.keys()) {
          if (cacheKey.startsWith(`${dataType}:`)) {
            this.cache.delete(cacheKey);
          }
        }
      }
    }
    
    /**
     * Update refresh interval for a data type
     * @param {string} dataType - The data type to update
     * @param {number} interval - The new interval in milliseconds
     */
    setRefreshInterval(dataType, interval) {
      this.refreshIntervals[dataType] = interval;
    }
  }
  
  // Create singleton instance
  const requestCoordinator = new RequestCoordinator();
  export default requestCoordinator;