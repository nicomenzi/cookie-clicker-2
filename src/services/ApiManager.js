// src/services/ApiManager.js
/**
 * Unified API manager that handles:
 * - Rate limiting with 10 req/s total limit (9 for TX, 1 for data)
 * - Request queueing and prioritization
 * - Caching
 * - Activity tracking
 */
class ApiManager {
  constructor() {
    // Rate limiting configuration - split transactions and data
    this.rateLimits = {
      transaction: {
        requestTimeWindow: 1000, // 1 second window
        maxRequestsPerWindow: 9, // 9 req/sec for transactions
        requestTimestamps: []
      },
      data: {
        requestTimeWindow: 1000, // 1 second window
        maxRequestsPerWindow: 1, // 1 req/sec for data queries
        requestTimestamps: []
      }
    };
    
    // Provider config - now using Monad direct RPC
    this.rpcUrls = {
      primary: "https://testnet-rpc.monad.xyz/",
    };
    
    this.currentRpcUrl = this.rpcUrls.primary;
    
    // Request queues by priority
    this.queues = {
      transaction: [],
      high: [],
      normal: [],
      low: []
    };
    
    // Cache with TTL
    this.cache = new Map();
    this.cacheTTL = new Map();
    
    // Processing state
    this.isProcessing = false;
    this.processingTimer = null;
    this.isProcessingTx = false;
    this.processingTxTimer = null;
    
    // Default refresh intervals
    this.refreshIntervals = {
      playerScore: 20 * 1000,            // 20 seconds
      redeemableTokens: 30 * 1000,       // 30 seconds
      cookieBalance: 30 * 1000,          // 30 seconds
      contractHasTokens: 5 * 60 * 1000,  // 5 minutes
      clicksPerToken: 10 * 60 * 1000,    // 10 minutes
      transactionHistory: 10 * 60 * 1000 // 10 minutes
    };
    
    // Default cache TTL settings
    this.defaultTTLs = {
      'balance': 30000,         // Balance: 30 seconds
      'token-balance': 30000,   // Token balance: 30 seconds
      'player-score': 20000,    // Player score: 20 seconds
      'contract-config': 300000 // Contract configuration: 5 minutes
    };
    
    // Activity tracking
    this.lastUserActivity = Date.now();
    this.isUserActive = true;
    
    // Track if app is in background
    this.isInBackground = false;
    
    // Error tracking
    this.errorCount = 0;
    this.lastErrorTime = 0;
    this.backoffTime = 1000; // Start with 1s backoff
    
    // Request stats for monitoring
    this.stats = {
      txRequests: 0,
      dataRequests: 0,
      errors: 0,
      rateExceeded: 0
    };
    
    // Start processing
    this.startProcessing();
    this.setupVisibilityHandler();
  }
  
  // --- Activity tracking ---
  
  /**
   * Setup visibility handler to pause processing when tab is hidden
   */
  setupVisibilityHandler() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.isInBackground = document.visibilityState === 'hidden';
        
        if (this.isInBackground) {
          this.pauseProcessing();
        } else {
          this.resumeProcessing();
        }
      });
      
      // Register user activity events
      ['mousedown', 'keydown', 'touchstart', 'click'].forEach(event => {
        window.addEventListener(event, () => this.registerUserActivity());
      });
    }
  }
  
  /**
   * Register user activity
   */
  registerUserActivity() {
    this.lastUserActivity = Date.now();
    this.isUserActive = true;
  }
  
  /**
   * Check for user inactivity
   */
  checkInactivity() {
    const inactiveTime = Date.now() - this.lastUserActivity;
    // Mark as inactive after 2 minutes of no interaction
    if (inactiveTime > 2 * 60 * 1000) {
      this.isUserActive = false;
    }
  }
  
  // --- Processing queue management ---
  
  /**
   * Pause processing when tab is hidden
   */
  pauseProcessing() {
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }
    
    if (this.processingTxTimer) {
      clearTimeout(this.processingTxTimer);
      this.processingTxTimer = null;
    }
  }
  
  /**
   * Resume processing when tab is visible
   */
  resumeProcessing() {
    if (!this.processingTimer) {
      this.startProcessing();
    }
  }
  
  /**
   * Start the request processing loop with separate transaction and data processing
   */
  startProcessing() {
    // Clear any existing timers
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
    }
    
    if (this.processingTxTimer) {
      clearTimeout(this.processingTxTimer);
    }
    
    // Transaction processing loop - faster to prioritize transactions
    const processTxLoop = () => {
      if (this.isInBackground) {
        // Don't process when tab is hidden
        this.processingTxTimer = setTimeout(processTxLoop, 1000);
        return;
      }
      
      this.processNextTransaction();
      this.processingTxTimer = setTimeout(processTxLoop, 110); // ~9 tx per second
    };
    
    // Data processing loop - slower to limit to ~1 req/sec
    const processDataLoop = () => {
      if (this.isInBackground) {
        // Don't process when tab is hidden
        this.processingTimer = setTimeout(processDataLoop, 1000);
        return;
      }
      
      this.processNextDataRequest();
      this.processingTimer = setTimeout(processDataLoop, 1000); // 1 data request per second
    };
    
    // Start both loops
    this.processingTxTimer = setTimeout(processTxLoop, 100);
    this.processingTimer = setTimeout(processDataLoop, 200);
  }
  
  /**
   * Stop the request processing loop
   */
  stopProcessing() {
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }
    
    if (this.processingTxTimer) {
      clearTimeout(this.processingTxTimer);
      this.processingTxTimer = null;
    }
  }
  
  // --- Rate limiting ---
  
  /**
   * Check if we can make a request based on rate limits
   * @param {string} requestType - 'transaction' or 'data'
   * @returns {boolean} True if we can make a request
   */
  canMakeRequest(requestType = 'data') {
    const now = Date.now();
    const limits = this.rateLimits[requestType];
    
    // Clean up old request timestamps
    limits.requestTimestamps = limits.requestTimestamps.filter(
      time => now - time < limits.requestTimeWindow
    );
    
    // Check if we have capacity
    return limits.requestTimestamps.length < limits.maxRequestsPerWindow;
  }
  
  /**
   * Record that a request was made
   * @param {string} requestType - 'transaction' or 'data'
   */
  recordRequest(requestType = 'data') {
    this.rateLimits[requestType].requestTimestamps.push(Date.now());
    
    // Update stats
    if (requestType === 'transaction') {
      this.stats.txRequests++;
    } else {
      this.stats.dataRequests++;
    }
  }
  
  /**
   * Calculate time to wait before next request
   * @param {string} requestType - 'transaction' or 'data'
   * @returns {number} Milliseconds to wait
   */
  getTimeToWait(requestType = 'data') {
    if (this.canMakeRequest(requestType)) {
      return 0;
    }
    
    const now = Date.now();
    const limits = this.rateLimits[requestType];
    const oldestRequest = limits.requestTimestamps[0];
    return limits.requestTimeWindow - (now - oldestRequest) + 50; // Add 50ms buffer
  }
  
  /**
   * Switch to backup RPC if needed
   */
  switchToBackupRpcIfNeeded() {
    if (this.currentRpcUrl === this.rpcUrls.primary) {
      console.log('Switching to backup RPC URL due to rate limits or errors');
      this.currentRpcUrl = this.rpcUrls.backup;
      setTimeout(() => {
        // Switch back after 10 seconds
        this.currentRpcUrl = this.rpcUrls.primary;
      }, 10000);
    }
  }
  
  // --- Request processing ---
  
  /**
   * Get the next data request (non-transaction)
   */
  getNextDataRequest() {
    // High priority data items first
    if (this.queues.high.length > 0) {
      return this.queues.high.shift();
    }
    
    // Then normal priority
    if (this.queues.normal.length > 0) {
      return this.queues.normal.shift();
    }
    
    // Finally low priority
    if (this.queues.low.length > 0) {
      return this.queues.low.shift();
    }
    
    return null;
  }
  
  /**
   * Process next data request in queue
   * @private
   */
  async processNextDataRequest() {
    if (this.isProcessing) return;
    
    // Check backoff due to errors
    const backoffTime = this.getBackoffTime();
    if (backoffTime > 0) {
      setTimeout(() => this.processNextDataRequest(), backoffTime);
      return;
    }
    
    // Get next data request
    const nextRequest = this.getNextDataRequest();
    if (!nextRequest) return;
    
    // Check rate limits
    if (!this.canMakeRequest('data')) {
      this.stats.rateExceeded++;
      console.log('Data rate limit hit, waiting before next request');
      const timeToWait = this.getTimeToWait('data');
      setTimeout(() => this.processNextDataRequest(), timeToWait);
      return;
    }
    
    // Process the request
    this.isProcessing = true;
    
    try {
      console.log(`Processing request: ${nextRequest.cacheKey || 'uncached request'}`);
      
      // Try primary RPC first
      let result;
      try {
        result = await nextRequest.fn(this.rpcUrls.primary);
      } catch (primaryError) {
        console.warn('Primary RPC failed, trying backup:', primaryError);
        // Try backup RPC
        result = await nextRequest.fn(this.rpcUrls.backup);
      }
      
      // Cache the result if needed
      if (nextRequest.cacheKey) {
        const ttl = nextRequest.cacheTTL || this.getDefaultTTL(nextRequest.cacheKey);
        this.cache.set(nextRequest.cacheKey, result);
        this.cacheTTL.set(nextRequest.cacheKey, Date.now() + ttl);
      }
      
      // Record the successful request
      this.recordRequest('data');
      
      // Reset error tracking on success
      this.errorCount = 0;
      this.backoffTime = 1000;
      
      nextRequest.resolve(result);
    } catch (error) {
      console.error('Request failed:', {
        key: nextRequest.cacheKey,
        error: error.message,
        code: error.code,
        stack: error.stack
      });
      
      // Increment error count and update backoff
      this.errorCount++;
      this.lastErrorTime = Date.now();
      this.backoffTime = Math.min(this.backoffTime * 2, 30000); // Max 30s backoff
      
      if (nextRequest.retries < nextRequest.maxRetries) {
        console.log(`Retrying request (${nextRequest.retries + 1}/${nextRequest.maxRetries})`);
        nextRequest.retries++;
        this.addToQueue(nextRequest);
      } else {
        nextRequest.reject(error);
      }
      
      this.stats.errors++;
    } finally {
      this.isProcessing = false;
      
      // Schedule next request
      const nextTime = Math.max(
        this.getTimeToWait('data'),
        this.getBackoffTime()
      );
      
      setTimeout(() => this.processNextDataRequest(), nextTime);
    }
  }
  
  /**
   * Process the next transaction in the queue (9 req/s)
   */
  async processNextTransaction() {
    if (this.isProcessingTx) return;
    
    // Skip if there are no transactions to process
    if (this.queues.transaction.length === 0) return;
    
    // Check rate limits for transactions
    if (!this.canMakeRequest('transaction')) {
      this.stats.rateExceeded++;
      console.log('Transaction rate limit hit, waiting before next transaction');
      const timeToWait = this.getTimeToWait('transaction');
      return; // The loop will check again later
    }
    
    // Get next transaction
    const nextTransaction = this.queues.transaction.shift();
    
    // Process the transaction
    this.isProcessingTx = true;
    
    try {
      // Record this transaction request
      this.recordRequest('transaction');
      
      // Execute the transaction
      const result = await nextTransaction.fn(this.currentRpcUrl);
      
      // Resolve the promise
      nextTransaction.resolve(result);
    } catch (error) {
      console.error('Transaction error:', error);
      this.stats.errors++;
      
      // Handle rate limit errors
      if (error?.message?.includes('429') || 
          error?.message?.includes('rate limit') ||
          error?.message?.includes('requests limited')) {
        
        this.switchToBackupRpcIfNeeded();
        
        // Requeue with backoff if retries remain
        if (nextTransaction.retries < nextTransaction.maxRetries) {
          nextTransaction.retries++;
          // Use exponential backoff
          const backoffTime = Math.pow(1.5, nextTransaction.retries) * 1000;
          
          setTimeout(() => {
            this.queues.transaction.push(nextTransaction);
          }, backoffTime);
        } else {
          nextTransaction.reject(error);
        }
      } else {
        // For other errors, reject immediately
        nextTransaction.reject(error);
      }
    } finally {
      this.isProcessingTx = false;
    }
  }
  
  /**
   * Add a request to the appropriate queue
   * @param {Object} request - The request object
   */
  addToQueue(request) {
    if (request.isTransaction) {
      this.queues.transaction.push(request);
      return;
    }
    
    switch (request.priority) {
      case 'high':
        this.queues.high.push(request);
        break;
      case 'low':
        this.queues.low.push(request);
        break;
      default:
        this.queues.normal.push(request);
    }
  }
  
  /**
   * Get exponential backoff time based on recent errors
   * @returns {number} Milliseconds to wait
   */
  getBackoffTime() {
    const now = Date.now();
    
    // Reset error count if it's been more than 1 minute since last error
    if (now - this.lastErrorTime > 60000) {
      this.errorCount = 0;
      this.backoffTime = 1000;
      return 0;
    }
    
    // If we have errors, calculate exponential backoff
    if (this.errorCount > 0) {
      return this.backoffTime;
    }
    
    return 0;
  }
  
  /**
   * Record an error and update backoff time
   * @param {Error} error - The error that occurred
   */
  recordError(error) {
    this.errorCount++;
    this.lastErrorTime = Date.now();
    
    // Check if it's a rate limit error
    const isRateLimit = error?.message?.includes('429') || 
                      error?.message?.includes('rate limit') || 
                      error?.message?.includes('requests limited');
                      
    // For rate limit errors, switch providers
    if (isRateLimit) {
      console.warn(`Rate limit hit on ${this.currentRpcUrl}!`);
      
      this.switchToBackupRpcIfNeeded();
      
      // Use a more modest backoff for rate limits since we switched providers
      this.backoffTime = Math.min(5000, this.backoffTime * 1.5);
    } else {
      // Increase backoff time (max 30 seconds) for other errors
      this.backoffTime = Math.min(30000, Math.pow(2, Math.min(4, this.errorCount)) * 1000);
    }
  }
  
  // --- Request API ---
  
  /**
   * Make a request with rate limiting and caching
   * @param {Function} requestFn - Function that returns a promise
   * @param {string} cacheKey - Key for caching (null for no caching)
   * @param {number} cacheTTL - Cache TTL in milliseconds (or use default)
   * @param {Object} options - Additional options
   * @returns {Promise} - The request result
   */
  request(requestFn, cacheKey = null, cacheTTL = null, options = {}) {
    const priority = options.priority || 'normal';
    const maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;
    const isTransaction = options.isTransaction || false;
    
    // Check cache first
    if (cacheKey && this.cache.has(cacheKey)) {
      const expiry = this.cacheTTL.get(cacheKey);
      if (expiry > Date.now()) {
        return Promise.resolve(this.cache.get(cacheKey));
      } else {
        // Cache expired
        this.cache.delete(cacheKey);
        this.cacheTTL.delete(cacheKey);
      }
    }
    
    // Create a new promise
    return new Promise((resolve, reject) => {
      const request = {
        fn: requestFn,
        cacheKey,
        cacheTTL,
        priority,
        isTransaction,
        resolve,
        reject,
        retries: 0,
        maxRetries,
        timestamp: Date.now()
      };
      
      this.addToQueue(request);
    });
  }
  
  /**
   * Make a transaction request with special high-priority handling
   * @param {Function} txFn - Function that sends the transaction
   * @returns {Promise} - The transaction result
   */
  sendTransaction(txFn) {
    return this.request(txFn, null, null, {
      priority: 'high',
      isTransaction: true,
      maxRetries: 2
    });
  }
  
  // --- Cache management ---
  
  /**
   * Get default TTL for a cache key
   * @param {string} cacheKey - The cache key
   * @returns {number} - TTL in milliseconds
   */
  getDefaultTTL(cacheKey) {
    for (const [type, ttl] of Object.entries(this.defaultTTLs)) {
      if (cacheKey.includes(type)) {
        return ttl;
      }
    }
    return 60000; // Default 1 minute TTL
  }
  
  /**
   * Check if a key exists in cache and is not expired
   * @param {string} cacheKey - The cache key to check
   * @returns {boolean} - True if the key exists and is not expired
   */
  hasInCache(cacheKey) {
    if (!this.cache.has(cacheKey)) return false;
    const expiry = this.cacheTTL.get(cacheKey);
    return expiry > Date.now();
  }
  
  /**
   * Get a value from cache
   * @param {string} cacheKey - The cache key to get
   * @returns {any} - The cached value or null if not found
   */
  getFromCache(cacheKey) {
    if (this.hasInCache(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    return null;
  }
  
  /**
   * Clear cache entries
   * @param {string|RegExp} pattern - Cache key pattern to match
   */
  clearCache(pattern = null) {
    if (!pattern) {
      this.cache.clear();
      this.cacheTTL.clear();
      return;
    }
    
    const keysToDelete = [];
    
    for (const key of this.cache.keys()) {
      if (pattern instanceof RegExp) {
        if (pattern.test(key)) {
          keysToDelete.push(key);
        }
      } else if (typeof pattern === 'string') {
        if (key.includes(pattern)) {
          keysToDelete.push(key);
        }
      }
    }
    
    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.cacheTTL.delete(key);
    }
  }
  
  // --- Data refresh management ---
  
  /**
   * Check if a data type should be refreshed - drastically reduced frequency
   * @param {string} dataType - The data type to check
   * @param {boolean} [forceRefresh=false] - Force a refresh regardless of time
   * @returns {boolean} - True if data should be refreshed
   */
  shouldRefresh(dataType, forceRefresh = false) {
    // Always refresh if forced
    if (forceRefresh) return true;
    
    // When page is hidden, block all requests
    if (this.isInBackground) {
      return false;
    }
    
    // If user is inactive, use much longer refresh intervals
    const inactivityMultiplier = this.isUserActive ? 1 : 10;
    
    // Get last update time
    const lastUpdate = this.lastUpdated?.get(dataType) || 0;
    const now = Date.now();
    
    // Get refresh interval (with inactivity multiplier)
    const interval = (this.refreshIntervals[dataType] || 300000) * inactivityMultiplier;
    
    // Only refresh if enough time has passed
    return (now - lastUpdate) >= interval;
  }
  
  /**
   * Record a data refresh
   * @param {string} dataType - The data type that was refreshed
   */
  recordRefresh(dataType) {
    if (!this.lastUpdated) this.lastUpdated = new Map();
    this.lastUpdated.set(dataType, Date.now());
  }
  
  /**
   * Get current API stats
   * @returns {Object} - Usage statistics
   */
  getStats() {
    return {
      ...this.stats,
      queueLengths: {
        transaction: this.queues.transaction.length,
        high: this.queues.high.length,
        normal: this.queues.normal.length,
        low: this.queues.low.length
      },
      cacheSize: this.cache.size,
      currentProvider: this.currentRpcUrl
    };
  }
}

// Create singleton instance
const apiManager = new ApiManager();

// Set minimal mode to balance API usage and data freshness
apiManager.setMinimalMode = function(minimal) {
  if (minimal) {
    // Balanced refresh intervals - still update critical data frequently
    this.refreshIntervals = {
      playerScore: 30 * 1000,            // 30 seconds
      redeemableTokens: 45 * 1000,       // 45 seconds
      cookieBalance: 45 * 1000,          // 45 seconds
      contractHasTokens: 5 * 60 * 1000,  // 5 minutes
      clicksPerToken: 10 * 60 * 1000,    // 10 minutes
      transactionHistory: 10 * 60 * 1000 // 10 minutes
    };
  } else {
    // Standard intervals - more frequent updates
    this.refreshIntervals = {
      playerScore: 20 * 1000,            // 20 seconds
      redeemableTokens: 30 * 1000,       // 30 seconds
      cookieBalance: 30 * 1000,          // 30 seconds
      contractHasTokens: 5 * 60 * 1000,  // 5 minutes
      clicksPerToken: 10 * 60 * 1000,    // 10 minutes
      transactionHistory: 10 * 60 * 1000 // 10 minutes
    };
  }
};

// Start in minimal mode
apiManager.setMinimalMode(true);

export default apiManager;