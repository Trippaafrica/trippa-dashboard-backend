import { Controller, Get } from '@nestjs/common';
import { DatabasePerformanceMonitor } from '../database/database-performance.service';
import { CacheService } from '../database/cache.service';
import { DatabaseConnectionService } from '../database/database-connection.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly performanceMonitor: DatabasePerformanceMonitor,
    private readonly cache: CacheService,
    private readonly dbConnection: DatabaseConnectionService
  ) {}

  @Get('database')
  async getDatabaseHealth() {
    return this.performanceMonitor.healthCheck();
  }

  @Get('performance')
  async getPerformanceMetrics() {
    const stats = this.performanceMonitor.getPerformanceStats();
    const cacheStats = this.cache.getStats();
    const connectionStats = this.dbConnection.getConnectionStats();

    return {
      database: stats,
      cache: cacheStats,
      connections: connectionStats,
      recommendations: this.performanceMonitor.getOptimizationRecommendations(),
      timestamp: new Date().toISOString()
    };
  }

  @Get('cache/stats')
  async getCacheStats() {
    return this.cache.getStats();
  }

  @Get('cache/clear')
  async clearCache() {
    this.cache.clear();
    return { message: 'Cache cleared successfully' };
  }

  @Get('optimization/recommendations')
  async getOptimizationRecommendations() {
    return {
      recommendations: this.performanceMonitor.getOptimizationRecommendations(),
      queryDistribution: this.performanceMonitor.getQueryDistribution(),
      trends: this.performanceMonitor.getPerformanceTrends(24)
    };
  }
}
