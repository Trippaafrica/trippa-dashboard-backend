import { Injectable } from '@nestjs/common';
import { AppLogger } from './logger.service';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number; // Time window in milliseconds
}

interface RateLimitTracker {
  requests: number[];
  lastReset: number;
}

@Injectable()
export class ProviderRateLimiterService {
  private readonly logger = new AppLogger(ProviderRateLimiterService.name);
  private limiters = new Map<string, RateLimitTracker>();
  
  // Default rate limits for different providers
  private readonly configs: Record<string, RateLimitConfig> = {
    fez: {
      maxRequests: parseInt(process.env.FEZ_RATE_LIMIT_REQUESTS || '60'), // 60 requests per minute (conservative estimate)
      windowMs: parseInt(process.env.FEZ_RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute window
    },
    faramove: {
      maxRequests: parseInt(process.env.FARAMOVE_RATE_LIMIT_REQUESTS || '100'),
      windowMs: parseInt(process.env.FARAMOVE_RATE_LIMIT_WINDOW_MS || '60000'),
    },
    glovo: {
      maxRequests: parseInt(process.env.GLOVO_RATE_LIMIT_REQUESTS || '120'),
      windowMs: parseInt(process.env.GLOVO_RATE_LIMIT_WINDOW_MS || '60000'),
    },
    gig: {
      maxRequests: parseInt(process.env.GIG_RATE_LIMIT_REQUESTS || '100'),
      windowMs: parseInt(process.env.GIG_RATE_LIMIT_WINDOW_MS || '60000'),
    },
    dhl: {
      maxRequests: parseInt(process.env.DHL_RATE_LIMIT_REQUESTS || '50'), // More conservative for international provider
      windowMs: parseInt(process.env.DHL_RATE_LIMIT_WINDOW_MS || '60000'),
    },
  };

  /**
   * Check if a request is allowed for the given provider
   * @param provider The logistics provider name
   * @returns Promise<boolean> True if request is allowed, false if rate limited
   */
  async checkRateLimit(provider: string): Promise<boolean> {
    const config = this.configs[provider.toLowerCase()];
    if (!config) {
      // No rate limit configured for this provider
      return true;
    }

    const now = Date.now();
    const key = provider.toLowerCase();
    
    if (!this.limiters.has(key)) {
      this.limiters.set(key, {
        requests: [],
        lastReset: now,
      });
    }

    const tracker = this.limiters.get(key)!;
    
    // Clean up old requests outside the window
    tracker.requests = tracker.requests.filter(
      requestTime => now - requestTime < config.windowMs
    );

    // Check if we're within the limit
    if (tracker.requests.length >= config.maxRequests) {
      console.warn(`[RateLimiter] Rate limit exceeded for provider: ${provider}`);
      return false;
    }

    // Record this request
    tracker.requests.push(now);
    return true;
  }

  /**
   * Get remaining requests for a provider
   * @param provider The logistics provider name
   * @returns number of remaining requests in current window
   */
  getRemainingRequests(provider: string): number {
    const config = this.configs[provider.toLowerCase()];
    if (!config) return Infinity;

    const key = provider.toLowerCase();
    const tracker = this.limiters.get(key);
    if (!tracker) return config.maxRequests;

    const now = Date.now();
    const validRequests = tracker.requests.filter(
      requestTime => now - requestTime < config.windowMs
    );

    return Math.max(0, config.maxRequests - validRequests.length);
  }

  /**
   * Get time until next request is allowed (in milliseconds)
   * @param provider The logistics provider name
   * @returns milliseconds until next request allowed, or 0 if immediately allowed
   */
  getTimeUntilReset(provider: string): number {
    const config = this.configs[provider.toLowerCase()];
    if (!config) return 0;

    const key = provider.toLowerCase();
    const tracker = this.limiters.get(key);
    if (!tracker || tracker.requests.length === 0) return 0;

    const oldestRequest = Math.min(...tracker.requests);
    const resetTime = oldestRequest + config.windowMs;
    const now = Date.now();

    return Math.max(0, resetTime - now);
  }

  /**
   * Wait for rate limit to allow the next request
   * @param provider The logistics provider name
   * @returns Promise that resolves when request is allowed
   */
  async waitForRateLimit(provider: string): Promise<void> {
    const isAllowed = await this.checkRateLimit(provider);
    if (isAllowed) return;

    const waitTime = this.getTimeUntilReset(provider);
    if (waitTime > 0) {
      this.logger.logRateLimit(`Waiting ${waitTime}ms for ${provider} rate limit reset`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Update rate limit configuration for a provider
   * @param provider The logistics provider name
   * @param config New rate limit configuration
   */
  updateConfig(provider: string, config: RateLimitConfig): void {
    this.configs[provider.toLowerCase()] = config;
    this.logger.logRateLimit(`Updated config for ${provider}`, config);
  }
}
