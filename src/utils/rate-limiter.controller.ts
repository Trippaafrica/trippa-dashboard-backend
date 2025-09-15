import { Controller, Get, Patch, Body, Param } from '@nestjs/common';
import { ProviderRateLimiterService } from './provider-rate-limiter.service';

interface RateLimitUpdate {
  maxRequests: number;
  windowMs: number;
}

@Controller('utils/rate-limiter')
export class RateLimiterController {
  constructor(private rateLimiterService: ProviderRateLimiterService) {}

  @Get(':provider/status')
  async getRateLimitStatus(@Param('provider') provider: string) {
    const remaining = this.rateLimiterService.getRemainingRequests(provider);
    const timeUntilReset = this.rateLimiterService.getTimeUntilReset(provider);

    return {
      provider: provider.toLowerCase(),
      remainingRequests: remaining,
      timeUntilResetMs: timeUntilReset,
      timeUntilResetSeconds: Math.ceil(timeUntilReset / 1000),
    };
  }

  @Patch(':provider/config')
  async updateRateLimit(
    @Param('provider') provider: string,
    @Body() config: RateLimitUpdate,
  ) {
    this.rateLimiterService.updateConfig(provider, config);
    return {
      message: `Rate limit configuration updated for ${provider}`,
      config: config,
    };
  }

  @Get('status')
  async getAllProvidersStatus() {
    const providers = ['fez', 'faramove', 'glovo', 'gig', 'dhl'];
    const statuses = {};

    for (const provider of providers) {
      const remaining = this.rateLimiterService.getRemainingRequests(provider);
      const timeUntilReset = this.rateLimiterService.getTimeUntilReset(provider);
      
      statuses[provider] = {
        remainingRequests: remaining,
        timeUntilResetMs: timeUntilReset,
        timeUntilResetSeconds: Math.ceil(timeUntilReset / 1000),
      };
    }

    return statuses;
  }
}
