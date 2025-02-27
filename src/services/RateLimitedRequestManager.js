// src/services/RateLimitedRequestManager.js

/**
 * A rate-limited request manager that prioritizes transactions
 * and manages RPC fallbacks to ensure successful transactions.
 * Optimized for both Alchemy and public RPC endpoints.
 */
class RateLimitedRequestManager {
    constructor() {
      // Prioritized queues
      this.transactionQueue = []; // Highest priority - for actual transactions
      this.highPriorityQueue = [];
      this.normalPriorityQueue = [];
      this.lowPriorityQueue = [];
      
      // Request processing state
      this.isProcessing = false;
      this.processingTimer = null;
      
      // Rate limit settings for different providers
      this.rateLimits = {
        alchemy: {
          requestTimeWindow: 1000, // 1 second window
          maxRequestsPerWindow: 10, // 10 req/sec for Alchemy
          requestTimestamps: []
        },
        public: {
          requestTimeWindow: 1000, // 1 second window
          maxRequestsPerWindow: 8, // 8 req/sec for public RPC
          requestTimestamps: []
        }
      };
      
      // Current provider
      this.currentProvider = 'alchemy';
      
      // Cache for read operations
      this.cache = new Map();
      this.cacheTTL = new Map();
      
      // Default cache TTL settings
      this.defaultTTLs = {
        'balance': 30000,         // Balance: 30 seconds
        'token-balance': 60000,   // Token balance: 1 minute
        'contract-config': 300000 // Contract configuration: 5 minutes
      };
      
      // Error tracking
      this.errorCount = 0;
      this.lastErrorTime = 0;
      this.backoffTime = 1000; // Start with 1s backoff
      
      // Start the processing loop
      this.startProcessing();
      
      // Setup visibility handler to pause processing when tab is hidden
      this.setupVisibilityHandler();
    }
    
    /**
     * Setup visibility handler to pause processing when tab is hidden
     */
    setupVisibilityHandler() {
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            // Pause processing when tab is hidden
            this.pauseProcessing();
          } else {
            // Resume processing when tab is visible
            this.resumeProcessing();
          }
        });
      }
    }
    
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
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
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
     * Switch provider if current one is rate limited
     */
    switchProviderIfNeeded() {
      if (!this.canMakeRequest(this.currentProvider)) {
        const alternative = this.currentProvider === 'alchemy' ? 'public' : 'alchemy';
        if (this.canMakeRequest(alternative)) {
          console.log(`Switching from ${this.currentProvider} to ${alternative} due to rate limits`);
          this.currentProvider = alternative;
        }
      }
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
        console.warn(`Rate limit hit on ${this.currentProvider}!`);
        
        // Switch providers for rate limits
        const alternative = this.currentProvider === 'alchemy' ? 'public' : 'alchemy';
        this.currentProvider = alternative;
        
        // Use a more modest backoff for rate limits since we switched providers
        this.backoffTime = Math.min(5000, this.backoffTime * 1.5);
      } else {
        // Increase backoff time (max 30 seconds) for other errors
        this.backoffTime = Math.min(30000, Math.pow(2, Math.min(4, this.errorCount)) * 1000);
      }
    }
    
    /**
     * Process the next request in the queue
     */
    async processNextRequest() {
      if (this.isProcessing) return;
      
      // Check if we need to back off due to errors
      const backoffTime = this.getBackoffTime();
      if (backoffTime > 0) {
        setTimeout(() => this.processNextRequest(), backoffTime);
        return;
      }
      
      // Check all queues in priority order
      const nextRequest = this.getNextRequest();
      if (!nextRequest) return;
      
      // For transaction requests, always try to send them regardless of rate limits
      if (nextRequest.isTransaction) {
        // Try both providers if needed for transactions
        this.processTransactionRequest(nextRequest);
        return;
      }
      
      // For regular requests, respect rate limits
      // Switch provider if current one is rate limited
      this.switchProviderIfNeeded();
      
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
        console.error('Request error:', error);
        
        // Record error for backoff
        this.recordError(error);
        
        // Handle rate limit errors
        if (error?.message?.includes('429') || 
            error?.message?.includes('rate limit') ||
            error?.message?.includes('requests limited')) {
          
          // Requeue with alternate provider if retries remain
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
     * Process a transaction request - with special handling to ensure it goes through
     * @param {Object} request - The transaction request
     */
    async processTransactionRequest(request) {
      this.isProcessing = true;
      
      try {
        // First try with current provider
        this.recordRequest();
        const result = await request.fn();
        request.resolve(result);
      } catch (error) {
        console.error('Transaction error:', error);
        
        // Check if it's a rate limit error
        if (error?.message?.includes('429') || 
            error?.message?.includes('rate limit') ||
            error?.message?.includes('requests limited')) {
          
          // Switch provider
          const alternative = this.currentProvider === 'alchemy' ? 'public' : 'alchemy';
          this.currentProvider = alternative;
          console.log(`Transaction failed on provider, switching to ${alternative}`);
          
          try {
            // Retry with alternative provider - this is important for transactions
            this.recordRequest(alternative);
            const result = await request.altFn ? request.altFn() : request.fn();
            request.resolve(result);
          } catch (altError) {
            // Both providers failed
            console.error('Both providers failed for transaction:', altError);
            request.reject(altError);
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
     * Get the next request from queues based on priority
     */
    getNextRequest() {
      // Transactions are highest priority
      if (this.transactionQueue.length > 0) {
        return this.transactionQueue.shift();
      }
      
      // Then high priority items
      if (this.highPriorityQueue.length > 0) {
        return this.highPriorityQueue.shift();
      }
      
      // Then normal priority
      if (this.normalPriorityQueue.length > 0) {
        return this.normalPriorityQueue.shift();
      }
      
      // Finally low priority
      if (this.lowPriorityQueue.length > 0) {
        return this.lowPriorityQueue.shift();
      }
      
      return null;
    }
    
    /**
     * Add a request to the appropriate queue
     * @param {Object} request - The request object
     */
    addToQueue(request) {
      if (request.isTransaction) {
        this.transactionQueue.push(request);
        return;
      }
      
      switch (request.priority) {
        case 'high':
          this.highPriorityQueue.push(request);
          break;
        case 'low':
          this.lowPriorityQueue.push(request);
          break;
        default:
          this.normalPriorityQueue.push(request);
      }
    }
    
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
          altFn: options.altFn, // Alternative function to call with different provider
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
     * @param {Function} altFn - Alternative function to try if first fails
     * @returns {Promise} - The transaction result
     */
    sendTransaction(txFn, altFn = null) {
      return this.request(txFn, null, null, {
        priority: 'high',
        isTransaction: true,
        altFn: altFn,
        maxRetries: 2
      });
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
    
    /**
     * Clear all cache keys matching a pattern
     * @param {string} pattern - The pattern to match
     */
    clearCachePattern(pattern) {
      if (!pattern) return;
      
      // Find all keys that match the pattern
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
          this.cacheTTL.delete(key);
        }
      }
    }
  }
  
  // Create singleton instance
  const rateLimitedManager = new RateLimitedRequestManager();
  export default rateLimitedManager;