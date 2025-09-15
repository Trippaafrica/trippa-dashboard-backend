import { Injectable } from '@nestjs/common';
import { DatabaseConnectionService } from './database-connection.service';
import { CacheService } from './cache.service';
import { SupabaseClient } from '@supabase/supabase-js';

interface FindOptions {
  select?: string;
  where?: Record<string, any>;
  orderBy?: { column: string; ascending?: boolean }[];
  limit?: number;
  offset?: number;
}

export interface FindManyResult<T> {
  data: T[];
  count?: number;
  hasMore: boolean;
}

export abstract class BaseRepository<T = any> {
  constructor(
    protected readonly dbConnection: DatabaseConnectionService,
    protected readonly cache: CacheService,
    protected readonly tableName: string
  ) {}

  // Optimized find one with caching
  async findOne(
    id: string, 
    options: { select?: string; useCache?: boolean; cacheTtl?: number } = {}
  ): Promise<T | null> {
    const { select = '*', useCache = true, cacheTtl = 300000 } = options;
    const cacheKey = `${this.tableName}:${id}:${select}`;

    if (useCache) {
      return this.cache.get(
        cacheKey,
        async () => {
          const client = this.dbConnection.getConnection('read');
          const { data, error } = await client
            .from(this.tableName)
            .select(select)
            .eq('id', id)
            .single();

          if (error && error.code !== 'PGRST116') throw error;
          return data as T;
        },
        cacheTtl,
        [this.tableName, `${this.tableName}:${id}`]
      );
    }

    const client = this.dbConnection.getConnection('read');
    const { data, error } = await client
      .from(this.tableName)
      .select(select)
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data as T;
  }

  // Optimized find many with pagination and caching
  async findMany(options: FindOptions & { 
    useCache?: boolean; 
    cacheTtl?: number;
    connectionType?: 'read' | 'analytics';
  } = {}): Promise<FindManyResult<T>> {
    const { 
      select = '*', 
      where, 
      orderBy, 
      limit = 10, 
      offset = 0,
      useCache = false,
      cacheTtl = 300000,
      connectionType = 'read'
    } = options;

    const cacheKey = useCache ? 
      `${this.tableName}:findMany:${JSON.stringify({ select, where, orderBy, limit, offset })}` : 
      null;

    const fetchData = async () => {
      const client = this.dbConnection.getConnection(connectionType);
      let query = client
        .from(this.tableName)
        .select(select, { count: 'exact' });

      // Apply where conditions
      if (where) {
        Object.entries(where).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            query = query.in(key, value);
          } else if (typeof value === 'object' && value !== null) {
            // Handle operators like { gte: value }, { ilike: value }
            Object.entries(value).forEach(([operator, operatorValue]) => {
              query = (query as any)[operator](key, operatorValue);
            });
          } else {
            query = query.eq(key, value);
          }
        });
      }

      // Apply ordering
      if (orderBy && orderBy.length > 0) {
        orderBy.forEach(({ column, ascending = true }) => {
          query = query.order(column, { ascending });
        });
      }

      // Apply pagination
      if (limit) {
        query = query.range(offset, offset + limit - 1);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        data: (data || []) as T[],
        count,
        hasMore: (data?.length || 0) === limit
      };
    };

    if (useCache && cacheKey) {
      return this.cache.get(cacheKey, fetchData, cacheTtl, [this.tableName]);
    }

    return fetchData();
  }

  // Optimized create with cache invalidation
  async create(data: Partial<T>, options: { select?: string } = {}): Promise<T> {
    const { select = '*' } = options;
    
    const client = this.dbConnection.getConnection('write');
    const { data: result, error } = await client
      .from(this.tableName)
      .insert(data)
      .select(select)
      .single();

    if (error) throw error;

    // Invalidate related cache
    this.cache.clearByTags([this.tableName]);

    return result as T;
  }

  // Optimized update with cache invalidation
  async update(
    id: string, 
    data: Partial<T>, 
    options: { select?: string } = {}
  ): Promise<T> {
    const { select = '*' } = options;

    const client = this.dbConnection.getConnection('write');
    const { data: result, error } = await client
      .from(this.tableName)
      .update(data)
      .eq('id', id)
      .select(select)
      .single();

    if (error) throw error;

    // Invalidate specific cache entries
    this.cache.clearByTags([this.tableName, `${this.tableName}:${id}`]);

    return result as T;
  }

  // Optimized batch update
  async updateMany(
    where: Record<string, any>,
    data: Partial<T>,
    options: { select?: string } = {}
  ): Promise<T[]> {
    const { select = '*' } = options;

    const client = this.dbConnection.getConnection('write');
    let query = client
      .from(this.tableName)
      .update(data)
      .select(select);

    // Apply where conditions
    Object.entries(where).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        query = (query as any).in(key, value);
      } else {
        query = (query as any).eq(key, value);
      }
    });

    const { data: result, error } = await query;
    if (error) throw error;

    // Invalidate related cache
    this.cache.clearByTags([this.tableName]);

    return (result || []) as T[];
  }

  // Optimized delete with cache invalidation
  async delete(id: string): Promise<boolean> {
    const client = this.dbConnection.getConnection('write');
    const { error } = await client
      .from(this.tableName)
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Invalidate specific cache entries
    this.cache.clearByTags([this.tableName, `${this.tableName}:${id}`]);

    return true;
  }

  // Count records with caching
  async count(
    where?: Record<string, any>,
    options: { useCache?: boolean; cacheTtl?: number } = {}
  ): Promise<number> {
    const { useCache = true, cacheTtl = 300000 } = options;
    const cacheKey = `${this.tableName}:count:${JSON.stringify(where || {})}`;

    const fetchCount = async () => {
      const client = this.dbConnection.getConnection('read');
      let query = client
        .from(this.tableName)
        .select('*', { count: 'exact', head: true });

      if (where) {
        Object.entries(where).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            query = query.in(key, value);
          } else {
            query = query.eq(key, value);
          }
        });
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    };

    if (useCache) {
      return this.cache.get(cacheKey, fetchCount, cacheTtl, [this.tableName]);
    }

    return fetchCount();
  }

  // Execute raw query with connection optimization
  async executeRaw(
    sql: string,
    params: any[] = [],
    connectionType: 'read' | 'write' | 'analytics' = 'read'
  ): Promise<any> {
    const client = this.dbConnection.getConnection(connectionType);
    
    // Use RPC for complex queries
    const { data, error } = await client.rpc('execute_sql', {
      sql_query: sql,
      sql_params: params
    });

    if (error) throw error;
    return data;
  }

  // Bulk operations for better performance
  async bulkCreate(records: Partial<T>[], options: { batchSize?: number } = {}): Promise<T[]> {
    const { batchSize = 100 } = options;
    const results: T[] = [];

    // Process in batches to avoid timeout
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      const client = this.dbConnection.getConnection('write');
      const { data, error } = await client
        .from(this.tableName)
        .insert(batch)
        .select();

      if (error) throw error;
      results.push(...((data || []) as T[]));
    }

    // Invalidate related cache
    this.cache.clearByTags([this.tableName]);

    return results;
  }

  // Upsert with optimistic locking
  async upsert(
    data: Partial<T> & { id?: string },
    options: { 
      onConflict?: string;
      select?: string;
    } = {}
  ): Promise<T> {
    const { onConflict = 'id', select = '*' } = options;

    const client = this.dbConnection.getConnection('write');
    const { data: result, error } = await client
      .from(this.tableName)
      .upsert(data, { onConflict })
      .select(select)
      .single();

    if (error) throw error;

    // Invalidate related cache
    this.cache.clearByTags([this.tableName]);
    if (data.id) {
      this.cache.clearByTags([`${this.tableName}:${data.id}`]);
    }

    return result as T;
  }

  // Aggregate operations
  async aggregate(
    operation: 'count' | 'sum' | 'avg' | 'min' | 'max',
    column: string,
    where?: Record<string, any>,
    options: { useCache?: boolean; cacheTtl?: number } = {}
  ): Promise<number> {
    const { useCache = true, cacheTtl = 300000 } = options;
    const cacheKey = `${this.tableName}:${operation}:${column}:${JSON.stringify(where || {})}`;

    const fetchAggregate = async () => {
      // This would require creating database functions for aggregation
      // For now, we'll use a basic implementation
      const result = await this.findMany({ where, limit: 1000 });
      
      switch (operation) {
        case 'count':
          return result.data.length;
        case 'sum':
          return result.data.reduce((sum, item) => sum + (Number((item as any)[column]) || 0), 0);
        case 'avg':
          const total = result.data.reduce((sum, item) => sum + (Number((item as any)[column]) || 0), 0);
          return result.data.length > 0 ? total / result.data.length : 0;
        case 'min':
          return Math.min(...result.data.map(item => Number((item as any)[column]) || 0));
        case 'max':
          return Math.max(...result.data.map(item => Number((item as any)[column]) || 0));
        default:
          return 0;
      }
    };

    if (useCache) {
      return this.cache.get(cacheKey, fetchAggregate, cacheTtl, [this.tableName]);
    }

    return fetchAggregate();
  }
}
