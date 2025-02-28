// src/services/ApiManager.js
/**
 * Unified API manager that handles:
 * - Rate limiting
 * - Request queueing and prioritization
 * - Caching
 * - Activity tracking
 */
class ApiManager {
  constructor() {
    // Rate limiting configuration - optimized for Monad testnet RPC
    this.rateLimits = {
      monadRPC: {
        requestTimeWindow: 1000, // 1 second window
        maxRequestsPerWindow: 9, // 9 req/sec for transactions (leaving 1 for data)
        requestTimestamps: []
      }
    };
    
    // Current provider
    this.currentProvider = 'monadRPC';
    
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
    
    // Default refresh intervals - longer intervals to reduce API usage
    this.refreshIntervals = {
      playerScore: 5 * 60 * 1000,      // 5 minutes
      redeemableTokens: 10 * 60 * 1000, // 10 minutes
      cookieBalance: 5 * 60 * 1000,    // 5 minutes
      contractHasTokens: 10 * 60 * 1000, // 10 minutes
      clicksPerToken: 30 * 60 * 1000,  // 30 minutes
      transactionHistory: 0 // 0 = disabled
    };
    
    // Default cache TTL settings
    this.defaultTTLs = {
      'balance': 60000,         // Balance: 1 minute
      'token-balance': 120000,   // Token balance: 2 minutes
      'contract-config': 600000 // Contract configuration: 10 minutes
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
   * Start the request processing loop
   */
  startProcessing() {
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
    }
    
    const processLoop = () => {
      if (this.isInBackground) {
        // Don't process when tab is hidden
        this.processingTimer = setTimeout(processLoop, 1000);
        return;
      }
      
      this.processNextRequest();
      this.processingTimer = setTimeout(processLoop, 100); // Check queue every 100ms
    };
    
    this.processingTimer = setTimeout(processLoop, 100);
  }
  
  /**
   * Stop the request processing loop
   */
  stopProcessing() {
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }
  }
  
  // --- Rate limiting ---
  
  /**
   * Check if we can make a request based on rate limits
   * @param {string} provider - The provider to check
   * @returns {boolean} True if we can make a request
   */
  canMakeRequest(provider = this.currentProvider) {
    const now = Date.now();
    const limits = this.rateLimits[provider];
    
    // Clean up old request timestamps
    limits.requestTimestamps = limits.requestTimestamps.filter(
      time => now - time < limits.requestTimeWindow
    );
    
    // Check if we have capacity
    return limits.requestTimestamps.length < limits.maxRequestsPerWindow;
  }
  
  /**
   * Record that a request was made
   * @param {string} provider - The provider that was used
   */
  recordRequest(provider = this.currentProvider) {
    this.rateLimits[provider].requestTimestamps.push(Date.now());
  }
  
  /**
   * Calculate time to wait before next request
   * @param {string} provider - The provider to check
   * @returns {number} Milliseconds to wait
   */
  getTimeToWait(provider = this.currentProvider) {
    if (this.canMakeRequest(provider)) {
      return 0;
    }
    
    const now = Date.now();
    const limits = this.rateLimits[provider];
    const oldestRequest = limits.requestTimestamps[0];
    return limits.requestTimeWindow - (now - oldestRequest) + 50; // Add 50ms buffer
  }
  
  // --- Request processing ---
  
  /**
   * Get the next request from queues based on priority
   */
  getNextRequest() {
    // Transactions are highest priority
    if (this.queues.transaction.length > 0) {
      return this.queues.transaction.shift();
    }
    
    // Then high priority items
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
   * Process the next request in the queue
   */
  async processNextRequest() {
    if (this.isProcessing) return;
    
    // Check backoff due to errors
    const backoffTime = this.getBackoffTime();
    if (backoffTime > 0) {
      setTimeout(() => this.processNextRequest(), backoffTime);
      return;
    }
    
    // Get next request
    const nextRequest = this.getNextRequest();
    if (!nextRequest) return;
    
    // Handle transaction requests specially
    if (nextRequest.isTransaction) {
      this.processTransactionRequest(nextRequest);
      return;
    }
    
    // Check rate limits
    if (!this.canMakeRequest()) {
      const timeToWait = this.getTimeToWait();
      setTimeout(() => this.processNextRequest(), timeToWait);
      return;
    }
    
    // Process the request
    this.isProcessing = true;
    
    try {
      // Record this request
      this.recordRequest();
      
      // Execute the request
      const result = await nextRequest.fn();
      
      // Cache if requested
      if (nextRequest.cacheKey) {
        this.cache.set(nextRequest.cacheKey, result);
        this.cacheTTL.set(
          nextRequest.cacheKey,
          Date.now() + (nextRequest.cacheTTL || this.getDefaultTTL(nextRequest.cacheKey))
        );
      }
      
      // Resolve the promise
      nextRequest.resolve(result);
    } catch (error) {
      // Record error for backoff
      this.recordError(error);
      
      // Handle rate limit errors
      if (error?.message?.includes('429') || 
          error?.message?.includes('rate limit') ||
          error?.message?.includes('requests limited')) {
        
        // Requeue with backoff if retries remain
        if (nextRequest.retries < nextRequest.maxRetries) {
          nextRequest.retries++;
          // Use exponential backoff
          const backoffTime = Math.pow(1.5, nextRequest.retries) * 1000;
          
          setTimeout(() => {
            this.addToQueue(nextRequest);
          }, backoffTime);
        } else {
          nextRequest.reject(error);
        }
      } else {
        // For other errors, reject immediately
        nextRequest.reject(error);
      }
    } finally {
      this.isProcessing = false;
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
   * Process a transaction request - with special handling to ensure it goes through
   * @param {Object} request - The transaction request
   */
  async processTransactionRequest(request) {
    this.isProcessing = true;
    
    try {
      // Check rate limits
      if (!this.canMakeRequest()) {
        const timeToWait = this.getTimeToWait();
        
        // For transactions, we always queue them if rate limit hit
        setTimeout(() => {
          this.addToQueue(request);
        }, timeToWait);
        
        this.isProcessing = false;
        return;
      }
      
      // Record this request
      this.recordRequest();
      
      // Execute the transaction request
      const result = await request.fn();
      request.resolve(result);
    } catch (error) {
      // Handle rate limit errors
      if (error?.message?.includes('429') || 
          error?.message?.includes('rate limit') ||
          error?.message?.includes('requests limited')) {
        
        // Requeue with backoff if retries remain
        if (request.retries < request.maxRetries) {
          request.retries++;
          // Use exponential backoff
          const backoffTime = Math.pow(2, request.retries) * 1000;
          
          setTimeout(() => {
            this.addToQueue(request);
          }, backoffTime);
        } else {
          request.reject(error);
        }
      } else {
        // Not a rate limit error, just reject
        request.reject(error);
      }
    } finally {
      this.isProcessing = false;
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
                      
    if (isRateLimit) {
      // More aggressive backoff for rate limits
      this.backoffTime = Math.min(10000, this.backoffTime * 2);
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
        isTransaction: options.isTransaction || false,
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
      maxRetries: 5 // More retries for transactions
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
   * Check if a data type should be refreshed
   * @param {string} dataType - The data type to check
   * @param {boolean} [forceRefresh=false] - Force a refresh regardless of time
   * @returns {boolean} - True if data should be refreshed
   */
  shouldRefresh(dataType, forceRefresh = false) {
    // Always refresh if forced
    if (forceRefresh) return true;
    
    // Skip if disabled (0 interval)
    if (this.refreshIntervals[dataType] === 0) return false;
    
    // When page is hidden, block almost all requests
    if (this.isInBackground) {
      return false;
    }
    
    // If user is inactive, use much longer refresh intervals
    const inactivityMultiplier = this.isUserActive ? 1 : 5;
    
    // Get last update time
    const lastUpdate = this.lastUpdated?.get(dataType) || 0;
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
    if (!this.lastUpdated) this.lastUpdated = new Map();
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
   * Set minimal refresh intervals for reduced API usage
   * @param {boolean} minimal - Whether to use minimal intervals
   */
  setMinimalMode(minimal) {
    if (minimal) {
      // Ultra-minimal refresh for reduced API usage
      this.refreshIntervals = {
        playerScore: 10 * 60 * 1000,      // 10 minutes
        redeemableTokens: 15 * 60 * 1000, // 15 minutes
        cookieBalance: 10 * 60 * 1000,    // 10 minutes
        contractHasTokens: 15 * 60 * 1000, // 15 minutes
        clicksPerToken: 60 * 60 * 1000,   // 60 minutes
        transactionHistory: 0 // Disabled
      };
    } else {
      // Reset to normal intervals (still conservative)
      this.refreshIntervals = {
        playerScore: 5 * 60 * 1000,      // 5 minutes
        redeemableTokens: 10 * 60 * 1000, // 10 minutes
        cookieBalance: 5 * 60 * 1000,    // 5 minutes
        contractHasTokens: 10 * 60 * 1000, // 10 minutes
        clicksPerToken: 30 * 60 * 1000,  // 30 minutes
        transactionHistory: 0 // Disabled
      };
    }
  }
}

// Create singleton instance
const apiManager = new ApiManager();

// Start in minimal mode to dramatically reduce API calls
apiManager.setMinimalMode(true);

export default apiManager;