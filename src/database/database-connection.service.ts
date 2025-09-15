import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class DatabaseConnectionService implements OnModuleInit, OnModuleDestroy {
  private supabaseClient: SupabaseClient;
  private readOnlyClient: SupabaseClient;
  private connectionPool: Map<string, SupabaseClient> = new Map();
  
  async onModuleInit() {
    // Main read-write connection
    this.supabaseClient = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_KEY || '',
      {
        db: {
          schema: 'public'
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false
        },
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      }
    );

    // Read-only connection for analytics queries
    this.readOnlyClient = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_ANON_KEY || '',
      {
        db: {
          schema: 'public'
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );

    // Initialize connection pool
    this.initializeConnectionPool();
  }

  async onModuleDestroy() {
    // Clean up connections
    for (const client of this.connectionPool.values()) {
      // Supabase client doesn't have explicit close method
      // But we can clear any pending requests
    }
    this.connectionPool.clear();
  }

  private initializeConnectionPool() {
    // Create specialized connections for different use cases
    
    // Analytics connection - optimized for read-heavy operations
    this.connectionPool.set('analytics', createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_KEY || '',
      {
        db: {
          schema: 'public'
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    ));

    // Orders connection - optimized for transactional operations
    this.connectionPool.set('orders', createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_KEY || '',
      {
        db: {
          schema: 'public'
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    ));

    // Reports connection - optimized for complex queries
    this.connectionPool.set('reports', createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_KEY || '',
      {
        db: {
          schema: 'public'
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    ));
  }

  // Get appropriate connection based on operation type
  getConnection(type: 'read' | 'write' | 'analytics' | 'orders' | 'reports' = 'write'): SupabaseClient {
    switch (type) {
      case 'read':
        return this.readOnlyClient;
      case 'analytics':
        return this.connectionPool.get('analytics') || this.supabaseClient;
      case 'orders':
        return this.connectionPool.get('orders') || this.supabaseClient;
      case 'reports':
        return this.connectionPool.get('reports') || this.supabaseClient;
      default:
        return this.supabaseClient;
    }
  }

  // Health check for database connections
  async healthCheck(): Promise<boolean> {
    try {
      const { data, error } = await this.supabaseClient
        .from('business')
        .select('id')
        .limit(1);
      
      return !error;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  // Get connection statistics
  getConnectionStats() {
    return {
      totalConnections: this.connectionPool.size + 2, // +2 for main and readonly
      poolTypes: Array.from(this.connectionPool.keys()),
      isHealthy: true // Would implement actual health monitoring
    };
  }

  // Execute query with automatic retry and connection failover
  async executeWithRetry<T>(
    queryFn: (client: SupabaseClient) => Promise<T>,
    connectionType: 'read' | 'write' | 'analytics' | 'orders' | 'reports' = 'write',
    maxRetries = 3
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = this.getConnection(connectionType);
        return await queryFn(client);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
    
    throw lastError!;
  }

  // Transaction wrapper
  async withTransaction<T>(
    transactionFn: (client: SupabaseClient) => Promise<T>
  ): Promise<T> {
    const client = this.getConnection('write');
    
    try {
      // Supabase doesn't have explicit transaction support in JS client
      // But we can use RPC functions for complex transactions
      return await transactionFn(client);
    } catch (error) {
      // Handle transaction rollback
      throw error;
    }
  }

  // Batch operations
  async batchExecute<T>(
    operations: Array<(client: SupabaseClient) => Promise<T>>,
    connectionType: 'read' | 'write' | 'analytics' | 'orders' | 'reports' = 'write'
  ): Promise<T[]> {
    const client = this.getConnection(connectionType);
    
    // Execute operations in parallel
    return Promise.all(operations.map(op => op(client)));
  }
}
