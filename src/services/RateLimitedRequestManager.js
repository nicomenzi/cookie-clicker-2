// src/services/RateLimitedRequestManager.js
// Optimized with better caching and request batching

/**
 * A strict rate-limited request manager specifically for Alchemy API
 * Optimized to reduce the number of requests
 */
class RateLimitedRequestManager {
    constructor() {
      // Request queue with priorities
      this.highPriorityQueue = [];
      this.normalPriorityQueue = [];
      this.lowPriorityQueue = [];
      
      // Request processing state
      this.isProcessing = false;
      this.processingTimer = null;
      
      // Rate limit settings - more conservative
      this.requestTimeWindow = 1000; // 1 second window
      this.maxRequestsPerWindow = 5; // Much more conservative (was 9)
      this.requestTimestamps = [];
      
      // Cache for read operations - enhanced
      this.cache = new Map();
      this.cacheTTL = new Map();
      
      // Batch similar requests
      this.pendingBatches = new Map();
      this.batchTimeouts = new Map();
      
      // Default cache TTL settings - LONGER CACHING
      this.defaultTTLs = {
        'player-score': 30000,      // Player score: 30 seconds (was 10s)
        'balance': 60000,           // Balance: 1 minute (was 10s)
        'token-balance': 120000,    // Token balance: 2 minutes (was 20s)
        'redeemable-tokens': 60000, // Redeemable tokens: 1 minute (was 10s)
        'contract-config': 300000,  // Contract configuration: 5 minutes (was 60s)
        'transaction-history': 120000 // Transaction history: 2 minutes (was 30s)
      };
      
      // Error tracking
      this.errorCount = 0;
      this.lastErrorTime = 0;
      this.backoffTime = 1000; // Start with 1s backoff
      
      // Start the processing loop
      this.startProcessing();
      
      // Setup visibility change handler to pause processing when tab is hidden
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
        this.processingTimer = setTimeout(processLoop, 200); // Check queue every 200ms
      };
      
      this.processingTimer = setTimeout(processLoop, 200);
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
     * @returns {boolean} True if we can make a request
     */
    canMakeRequest() {
      const now = Date.now();
      
      // Clean up old request timestamps
      this.requestTimestamps = this.requestTimestamps.filter(time => now - time < this.requestTimeWindow);
      
      // Check if we have capacity
      return this.requestTimestamps.length < this.maxRequestsPerWindow;
    }
    
    /**
     * Record that a request was made
     */
    recordRequest() {
      this.requestTimestamps.push(Date.now());
    }
    
    /**
     * Calculate time to wait before next request
     * @returns {number} Milliseconds to wait
     */
    getTimeToWait() {
      if (this.canMakeRequest()) {
        return 0;
      }
      
      const now = Date.now();
      const oldestRequest = this.requestTimestamps[0];
      return this.requestTimeWindow - (now - oldestRequest) + 100; // Add 100ms buffer
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
      
      // Check if it's a rate limit error specifically
      const isRateLimit = error?.message?.includes('429') || 
                        error?.message?.includes('rate limit') || 
                        error?.message?.includes('requests limited');
                        
      // For rate limit errors, use a more aggressive backoff
      if (isRateLimit) {
        // Reduce max requests per window
        this.maxRequestsPerWindow = Math.max(2, this.maxRequestsPerWindow - 1);
        console.warn(`Rate limit hit! Reducing to ${this.maxRequestsPerWindow} req/sec`);
        
        // Use a longer backoff
        this.backoffTime = Math.min(60000, Math.pow(2, Math.min(6, this.errorCount)) * 1000);
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
          const ttl = nextRequest.cacheTTL || this.getDefaultTTL(nextRequest.cacheKey);
          this.cacheTTL.set(nextRequest.cacheKey, Date.now() + ttl);
        }
        
        // Resolve the promise
        nextRequest.resolve(result);
        
        // Successful request - we can gradually increase allowed rate if needed
        if (this.maxRequestsPerWindow < 5 && this.errorCount === 0) {
          // Very slowly increase the rate limit
          this.maxRequestsPerWindow = Math.min(5, this.maxRequestsPerWindow + 0.1);
        }
      } catch (error) {
        console.error('Request error:', error);
        
        // Record error for backoff
        this.recordError(error);
        
        // Check if it's a rate limit or other RPC error
        const isRateLimit = error?.message?.includes('429') || 
                          error?.message?.includes('rate limit') || 
                          error?.message?.includes('requests limited');
        
        if (isRateLimit) {
          console.warn('Rate limit hit, backing off...');
          
          // Add back to queue if retries remain
          if (nextRequest.retries < nextRequest.maxRetries) {
            nextRequest.retries++;
            const backoffTime = Math.pow(2, nextRequest.retries) * 1000;
            
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
     * Get the next request from queues based on priority
     */
    getNextRequest() {
      if (this.highPriorityQueue.length > 0) {
        return this.highPriorityQueue.shift();
      }
      
      if (this.normalPriorityQueue.length > 0) {
        return this.normalPriorityQueue.shift();
      }
      
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
      return 60000; // Default 1 minute TTL (was 10s)
    }
    
    /**
     * Create a batch key from request parameters
     * @param {string} prefix - The batch prefix
     * @param {Object} params - The parameters
     * @returns {string} - The batch key
     */
    getBatchKey(prefix, params) {
      return `${prefix}:${JSON.stringify(params)}`;
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
      const batchKey = options.batchKey || null;
      const batchParams = options.batchParams || null;
      
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
      
      // If this is a batchable request, check for an existing batch
      if (batchKey && batchParams) {
        const fullBatchKey = this.getBatchKey(batchKey, batchParams);
        
        if (this.pendingBatches.has(fullBatchKey)) {
          // Add to existing batch
          return new Promise((resolve, reject) => {
            this.pendingBatches.get(fullBatchKey).push({ resolve, reject });
          });
        } else {
          // Create a new batch
          this.pendingBatches.set(fullBatchKey, []);
          
          // Setup timeout to execute batch
          const timeoutId = setTimeout(() => {
            const batch = this.pendingBatches.get(fullBatchKey);
            this.pendingBatches.delete(fullBatchKey);
            this.batchTimeouts.delete(fullBatchKey);
            
            // Execute the batch request
            requestFn()
              .then(result => {
                // Cache the result
                if (cacheKey) {
                  this.cache.set(cacheKey, result);
                  const ttl = cacheTTL || this.getDefaultTTL(cacheKey);
                  this.cacheTTL.set(cacheKey, Date.now() + ttl);
                }
                
                // Resolve all promises in the batch
                batch.forEach(({ resolve }) => resolve(result));
              })
              .catch(error => {
                // Reject all promises in the batch
                batch.forEach(({ reject }) => reject(error));
              });
          }, 20); // Short delay to allow batching
          
          this.batchTimeouts.set(fullBatchKey, timeoutId);
        }
        
        // Return promise for the current request
        return new Promise((resolve, reject) => {
          this.pendingBatches.get(fullBatchKey).push({ resolve, reject });
        });
      }
      
      // Create a new promise for non-batchable requests
      return new Promise((resolve, reject) => {
        const request = {
          fn: requestFn,
          cacheKey,
          cacheTTL,
          priority,
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
     * Update rate limit settings
     * @param {Object} settings - New settings
     */
    updateSettings(settings) {
      if (settings.maxRequestsPerWindow) {
        this.maxRequestsPerWindow = settings.maxRequestsPerWindow;
      }
      
      if (settings.requestTimeWindow) {
        this.requestTimeWindow = settings.requestTimeWindow;
      }
      
      if (settings.cacheTTLs) {
        this.defaultTTLs = { ...this.defaultTTLs, ...settings.cacheTTLs };
      }
    }
    
    /**
     * Get current queue and cache stats
     * @returns {Object} - Queue statistics
     */
    getStats() {
      return {
        highPriorityQueueLength: this.highPriorityQueue.length,
        normalPriorityQueueLength: this.normalPriorityQueue.length,
        lowPriorityQueueLength: this.lowPriorityQueue.length,
        currentRate: this.maxRequestsPerWindow,
        backoffTime: this.backoffTime,
        errorCount: this.errorCount,
        isProcessing: this.isProcessing,
        currentRequestCount: this.requestTimestamps.length,
        cacheSize: this.cache.size,
        pendingBatches: this.pendingBatches.size
      };
    }
    // Add these missing helper methods to RateLimitedRequestManager.js class

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
  
  // Create a singleton instance
  const rateLimitedManager = new RateLimitedRequestManager();
  export default rateLimitedManager;

  