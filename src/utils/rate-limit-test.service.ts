import { Injectable } from '@nestjs/common';
import { ProviderRateLimiterService } from '../utils/provider-rate-limiter.service';

@Injectable()
export class RateLimitTestService {
  constructor(private rateLimiter: ProviderRateLimiterService) {}

  /**
   * Test rate limiting for a specific provider
   * @param provider The provider name to test
   * @param requestCount Number of test requests to make
   * @returns Test results
   */
  async testProviderRateLimit(provider: string, requestCount: number = 5) {
    const results = [];
    const startTime = Date.now();

    for (let i = 1; i <= requestCount; i++) {
      const allowed = await this.rateLimiter.checkRateLimit(provider);
      const remaining = this.rateLimiter.getRemainingRequests(provider);
      const timeUntilReset = this.rateLimiter.getTimeUntilReset(provider);

      results.push({
        requestNumber: i,
        allowed,
        remainingRequests: remaining,
        timeUntilResetMs: timeUntilReset,
        timestamp: new Date().toISOString(),
      });

      // Small delay between requests
      if (i < requestCount) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      provider,
      totalRequests: requestCount,
      duration: Date.now() - startTime,
      results,
    };
  }

  /**
   * Get current rate limit status for all providers
   */
  getAllProvidersStatus() {
    const providers = ['fez', 'faramove', 'glovo', 'gig', 'dhl'];
    const statuses = {};

    for (const provider of providers) {
      const remaining = this.rateLimiter.getRemainingRequests(provider);
      const timeUntilReset = this.rateLimiter.getTimeUntilReset(provider);
      
      statuses[provider] = {
        remainingRequests: remaining,
        timeUntilResetMs: timeUntilReset,
        timeUntilResetSeconds: Math.ceil(timeUntilReset / 1000),
      };
    }

    return statuses;
  }
}
