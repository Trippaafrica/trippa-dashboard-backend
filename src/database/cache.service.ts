import { Injectable } from '@nestjs/common';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  tags: string[];
}

@Injectable()
export class CacheService {
  private cache = new Map<string, CacheEntry<any>>();
  private tagIndex = new Map<string, Set<string>>();

  // Get cached data or execute function and cache result
  async get<T>(
    key: string, 
    fetcher: () => Promise<T>, 
    ttlMs = 300000, // 5 minutes default
    tags: string[] = []
  ): Promise<T> {
    const now = Date.now();
    const cached = this.cache.get(key);

    // Check if cache is valid
    if (cached && now - cached.timestamp < cached.ttl) {
      return cached.data;
    }

    // Fetch new data
    const data = await fetcher();
    
    // Store in cache
    this.set(key, data, ttlMs, tags);
    
    return data;
  }

  // Set cache entry
  set<T>(key: string, data: T, ttlMs = 300000, tags: string[] = []): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
      tags
    };

    this.cache.set(key, entry);

    // Update tag index
    tags.forEach(tag => {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    });
  }

  // Get cached data without fetching
  getSync<T>(key: string): T | null {
    const now = Date.now();
    const cached = this.cache.get(key);

    if (cached && now - cached.timestamp < cached.ttl) {
      return cached.data;
    }

    return null;
  }

  // Delete specific cache entry
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    
    if (entry) {
      // Remove from tag index
      entry.tags.forEach(tag => {
        const keys = this.tagIndex.get(tag);
        if (keys) {
          keys.delete(key);
          if (keys.size === 0) {
            this.tagIndex.delete(tag);
          }
        }
      });
      
      return this.cache.delete(key);
    }
    
    return false;
  }

  // Clear cache by tags
  clearByTags(tags: string[]): number {
    const keysToDelete = new Set<string>();
    
    tags.forEach(tag => {
      const keys = this.tagIndex.get(tag);
      if (keys) {
        keys.forEach(key => keysToDelete.add(key));
      }
    });

    keysToDelete.forEach(key => this.delete(key));
    
    return keysToDelete.size;
  }

  // Clear cache by pattern
  clearByPattern(pattern: string): number {
    const regex = new RegExp(pattern);
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.delete(key));
    
    return keysToDelete.length;
  }

  // Clear all cache
  clear(): void {
    this.cache.clear();
    this.tagIndex.clear();
  }

  // Get cache statistics
  getStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;
    let totalSize = 0;

    for (const [key, entry] of this.cache.entries()) {
      totalSize += JSON.stringify(entry.data).length;
      
      if (now - entry.timestamp < entry.ttl) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
      totalTags: this.tagIndex.size,
      estimatedSizeBytes: totalSize,
      hitRate: this.calculateHitRate()
    };
  }

  // Cleanup expired entries
  cleanup(): number {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= entry.ttl) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.delete(key));
    
    return expiredKeys.length;
  }

  // Cache hit rate calculation (simplified)
  private hitRate = { hits: 0, misses: 0 };
  
  private calculateHitRate(): number {
    const total = this.hitRate.hits + this.hitRate.misses;
    return total > 0 ? this.hitRate.hits / total : 0;
  }

  // Increment hit counter
  recordHit(): void {
    this.hitRate.hits++;
  }

  // Increment miss counter
  recordMiss(): void {
    this.hitRate.misses++;
  }

  // Memoization decorator for methods
  memoize<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    keyGenerator: (...args: Parameters<T>) => string,
    ttlMs = 300000,
    tags: string[] = []
  ): T {
    return (async (...args: Parameters<T>) => {
      const key = keyGenerator(...args);
      return this.get(key, () => fn(...args), ttlMs, tags);
    }) as T;
  }

  // Preload cache with common data
  async preload(entries: Array<{
    key: string;
    fetcher: () => Promise<any>;
    ttlMs?: number;
    tags?: string[];
  }>): Promise<void> {
    const promises = entries.map(entry => 
      this.get(entry.key, entry.fetcher, entry.ttlMs, entry.tags)
    );
    
    await Promise.all(promises);
  }

  // Cache warming for specific business data
  async warmBusinessCache(businessId: string): Promise<void> {
    const { QueryOptimizerService } = await import('./query-optimizer.service');
    const queryOptimizer = new QueryOptimizerService();

    const warmingTasks = [
      {
        key: `business:${businessId}:orders`,
        fetcher: () => queryOptimizer.getPaginatedOrders(businessId, { limit: 50 }),
        ttlMs: 600000, // 10 minutes
        tags: ['business', `business:${businessId}`, 'orders']
      },
      {
        key: `business:${businessId}:analytics`,
        fetcher: () => queryOptimizer.getBusinessAnalytics(businessId),
        ttlMs: 1800000, // 30 minutes
        tags: ['business', `business:${businessId}`, 'analytics']
      },
      {
        key: `business:${businessId}:stats`,
        fetcher: () => queryOptimizer.getDashboardStats(businessId),
        ttlMs: 900000, // 15 minutes
        tags: ['business', `business:${businessId}`, 'stats']
      }
    ];

    await this.preload(warmingTasks);
  }
}
