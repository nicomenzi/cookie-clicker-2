// src/services/RateLimitedRequestManager.js

/**
 * A strict rate-limited request manager specifically for Monad's API rate limits
 * Optimized for Alchemy API requests
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
      
      // Rate limit settings - adjusted for Alchemy API
      this.requestTimeWindow = 1000; // 1 second window
      this.maxRequestsPerWindow = 25; // Maximum requests per second (Alchemy-adjusted)
      this.requestTimestamps = [];
      
      // Cache for read operations
      this.cache = new Map();
      this.cacheTTL = new Map();
      
      // Default cache TTL settings based on data type
      this.defaultTTLs = {
        'balance': 10000,        // Balance: 10 seconds
        'token-balance': 20000,  // Token balance: 20 seconds
        'contract-config': 60000 // Contract configuration: 60 seconds
      };
      
      // Error tracking
      this.errorCount = 0;
      this.lastErrorTime = 0;
      this.backoffTime = 1000; // Start with 1s backoff
      
      // Start the processing loop
      this.startProcessing();
    }
    
    /**
     * Start the request processing loop
     */
    startProcessing() {
      if (this.processingTimer) {
        clearTimeout(this.processingTimer);
      }
      
      const processLoop = () => {
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
      return this.requestTimeWindow - (now - oldestRequest) + 50; // Add 50ms buffer
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
     */
    recordError() {
      this.errorCount++;
      this.lastErrorTime = Date.now();
      
      // Increase backoff time (max 30 seconds)
      this.backoffTime = Math.min(30000, Math.pow(2, Math.min(4, this.errorCount)) * 1000);
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
        this.recordError();
        
        // Handle rate limit errors
        if (error?.message?.includes('429') || error?.message?.includes('rate limit')) {
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
      return 10000; // Default 10 second TTL
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
    }
  }
  
  // Create a singleton instance
  const rateLimitedManager = new RateLimitedRequestManager();
  export default rateLimitedManager;