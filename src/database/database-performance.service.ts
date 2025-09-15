import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseConnectionService } from './database-connection.service';
import { CacheService } from './cache.service';

interface QueryMetrics {
  queryTime: number;
  queryType: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  success: boolean;
  timestamp: Date;
}

export interface PerformanceStats {
  avgQueryTime: number;
  slowQueries: QueryMetrics[];
  queryCount: number;
  errorRate: number;
  cacheHitRate: number;
  connectionHealth: boolean;
}

@Injectable()
export class DatabasePerformanceMonitor {
  private readonly logger = new Logger(DatabasePerformanceMonitor.name);
  private queryMetrics: QueryMetrics[] = [];
  private readonly maxMetricsHistory = 1000;
  private readonly slowQueryThreshold = 1000; // 1 second

  constructor(
    private readonly dbConnection: DatabaseConnectionService,
    private readonly cache: CacheService
  ) {}

  // Record query performance
  recordQuery(metrics: QueryMetrics) {
    this.queryMetrics.push(metrics);
    
    // Keep only recent metrics
    if (this.queryMetrics.length > this.maxMetricsHistory) {
      this.queryMetrics = this.queryMetrics.slice(-this.maxMetricsHistory);
    }

    // Log slow queries
    if (metrics.queryTime > this.slowQueryThreshold) {
      this.logger.warn(`Slow query detected: ${metrics.table} took ${metrics.queryTime}ms`);
    }

    // Log failed queries
    if (!metrics.success) {
      this.logger.error(`Query failed on table: ${metrics.table}`);
    }
  }

  // Get current performance statistics
  getPerformanceStats(): PerformanceStats {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Filter recent metrics
    const recentMetrics = this.queryMetrics.filter(
      metric => metric.timestamp > oneHourAgo
    );

    if (recentMetrics.length === 0) {
      return {
        avgQueryTime: 0,
        slowQueries: [],
        queryCount: 0,
        errorRate: 0,
        cacheHitRate: 0,
        connectionHealth: true
      };
    }

    const successfulQueries = recentMetrics.filter(m => m.success);
    const slowQueries = recentMetrics.filter(m => m.queryTime > this.slowQueryThreshold);
    
    const avgQueryTime = successfulQueries.length > 0 
      ? successfulQueries.reduce((sum, m) => sum + m.queryTime, 0) / successfulQueries.length
      : 0;

    const errorRate = recentMetrics.length > 0 
      ? (recentMetrics.length - successfulQueries.length) / recentMetrics.length
      : 0;

    const cacheStats = this.cache.getStats();

    return {
      avgQueryTime: Math.round(avgQueryTime),
      slowQueries: slowQueries.slice(-10), // Last 10 slow queries
      queryCount: recentMetrics.length,
      errorRate: Math.round(errorRate * 100) / 100,
      cacheHitRate: cacheStats.hitRate,
      connectionHealth: true // Would implement actual health check
    };
  }

  // Wrap query execution with performance monitoring
  async monitorQuery<T>(
    queryFn: () => Promise<T>,
    queryType: QueryMetrics['queryType'],
    table: string
  ): Promise<T> {
    const startTime = Date.now();
    let success = true;
    let result: T;

    try {
      result = await queryFn();
      return result;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      const queryTime = Date.now() - startTime;
      
      this.recordQuery({
        queryTime,
        queryType,
        table,
        success,
        timestamp: new Date()
      });
    }
  }

  // Performance optimization recommendations
  getOptimizationRecommendations(): string[] {
    const stats = this.getPerformanceStats();
    const recommendations: string[] = [];

    // Check average query time
    if (stats.avgQueryTime > 500) {
      recommendations.push('Consider adding database indexes for frequently queried columns');
    }

    // Check slow queries
    if (stats.slowQueries.length > 5) {
      const slowTables = new Set(stats.slowQueries.map(q => q.table));
      recommendations.push(`Optimize queries for tables: ${Array.from(slowTables).join(', ')}`);
    }

    // Check error rate
    if (stats.errorRate > 0.05) { // 5%
      recommendations.push('High error rate detected - review query logic and database constraints');
    }

    // Check cache hit rate
    if (stats.cacheHitRate < 0.7) { // 70%
      recommendations.push('Low cache hit rate - consider caching more frequently accessed data');
    }

    // Check query volume
    if (stats.queryCount > 100) { // per hour
      recommendations.push('High query volume - consider implementing query batching or pagination');
    }

    return recommendations;
  }

  // Database maintenance tasks
  @Cron(CronExpression.EVERY_HOUR)
  async performMaintenanceTasks() {
    try {
      // Clean up old cache entries
      const cleanedEntries = this.cache.cleanup();
      if (cleanedEntries > 0) {
        this.logger.log(`Cleaned up ${cleanedEntries} expired cache entries`);
      }

      // Log performance stats
      const stats = this.getPerformanceStats();
      this.logger.log(`Performance Stats: Avg Query Time: ${stats.avgQueryTime}ms, Cache Hit Rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`);

      // Check for performance issues
      const recommendations = this.getOptimizationRecommendations();
      if (recommendations.length > 0) {
        this.logger.warn(`Performance Recommendations: ${recommendations.join('; ')}`);
      }

    } catch (error) {
      this.logger.error('Error during maintenance tasks:', error);
    }
  }

  // Health check for monitoring systems
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: any;
  }> {
    try {
      const stats = this.getPerformanceStats();
      const dbHealth = await this.dbConnection.healthCheck();
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      // Determine health status
      if (!dbHealth || stats.errorRate > 0.1) {
        status = 'unhealthy';
      } else if (stats.avgQueryTime > 1000 || stats.cacheHitRate < 0.5) {
        status = 'degraded';
      }

      return {
        status,
        details: {
          database: dbHealth,
          performance: stats,
          recommendations: this.getOptimizationRecommendations(),
          connectionStats: this.dbConnection.getConnectionStats()
        }
      };
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }

  // Get query distribution by table
  getQueryDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    this.queryMetrics.forEach(metric => {
      distribution[metric.table] = (distribution[metric.table] || 0) + 1;
    });

    return distribution;
  }

  // Get performance trends
  getPerformanceTrends(hours = 24): Array<{
    timestamp: string;
    avgQueryTime: number;
    queryCount: number;
    errorRate: number;
  }> {
    const now = new Date();
    const trends: Array<{
      timestamp: string;
      avgQueryTime: number;
      queryCount: number;
      errorRate: number;
    }> = [];

    for (let i = hours - 1; i >= 0; i--) {
      const hourStart = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
      
      const hourMetrics = this.queryMetrics.filter(
        metric => metric.timestamp >= hourStart && metric.timestamp < hourEnd
      );

      const successfulQueries = hourMetrics.filter(m => m.success);
      const avgQueryTime = successfulQueries.length > 0
        ? successfulQueries.reduce((sum, m) => sum + m.queryTime, 0) / successfulQueries.length
        : 0;

      const errorRate = hourMetrics.length > 0
        ? (hourMetrics.length - successfulQueries.length) / hourMetrics.length
        : 0;

      trends.push({
        timestamp: hourStart.toISOString(),
        avgQueryTime: Math.round(avgQueryTime),
        queryCount: hourMetrics.length,
        errorRate: Math.round(errorRate * 100) / 100
      });
    }

    return trends;
  }
}
