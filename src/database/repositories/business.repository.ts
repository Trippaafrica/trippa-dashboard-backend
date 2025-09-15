import { Injectable } from '@nestjs/common';
import { BaseRepository, FindManyResult } from '../base-repository.service';
import { DatabaseConnectionService } from '../database-connection.service';
import { CacheService } from '../cache.service';

interface Business {
  id: string;
  email: string;
  phone: string;
  business_name: string;
  api_key?: string;
  pickup_address?: string;
  pickup_city?: string;
  pickup_state?: string;
  supabase_user_id?: string;
  status: 'active' | 'inactive';
  wallet_balance?: number;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class BusinessRepository extends BaseRepository<Business> {
  constructor(
    dbConnection: DatabaseConnectionService,
    cache: CacheService
  ) {
    super(dbConnection, cache, 'business');
  }

  // Find business by API key (frequently used for authentication)
  async findByApiKey(apiKey: string): Promise<Business | null> {
    const cacheKey = `business:apikey:${apiKey}`;
    
    return this.cache.get(
      cacheKey,
      async () => {
        const client = this.dbConnection.getConnection('read');
        const { data, error } = await client
          .from('business')
          .select('*')
          .eq('api_key', apiKey)
          .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data as Business;
      },
      600000, // 10 minutes cache for API key lookups
      ['business', 'api_keys']
    );
  }

  // Find business by Supabase user ID
  async findBySupabaseUserId(supabaseUserId: string): Promise<Business | null> {
    const cacheKey = `business:supabase_user:${supabaseUserId}`;
    
    return this.cache.get(
      cacheKey,
      async () => {
        const client = this.dbConnection.getConnection('read');
        const { data, error } = await client
          .from('business')
          .select('*')
          .eq('supabase_user_id', supabaseUserId)
          .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data as Business;
      },
      300000, // 5 minutes cache
      ['business', `supabase_user:${supabaseUserId}`]
    );
  }

  // Get businesses with their order counts
  async getBusinessesWithOrderCounts(): Promise<Array<Business & { orderCount: number; totalRevenue: number }>> {
    const cacheKey = 'businesses_with_order_counts';
    
    return this.cache.get(
      cacheKey,
      async () => {
        const client = this.dbConnection.getConnection('analytics');
        
        // Get all businesses and orders in parallel
        const [businessesResult, ordersResult] = await Promise.all([
          client.from('business').select('*'),
          client.from('order').select('id, business_id, delivery_cost')
        ]);

        if (businessesResult.error) throw businessesResult.error;
        if (ordersResult.error) throw ordersResult.error;

        const businesses = businessesResult.data as Business[];
        const orders = ordersResult.data || [];

        // Create lookup maps
        const orderCounts = new Map<string, number>();
        const revenueMap = new Map<string, number>();

        orders.forEach(order => {
          if (order.business_id) {
            orderCounts.set(order.business_id, (orderCounts.get(order.business_id) || 0) + 1);
            
            const revenue = Number(order.delivery_cost?.total_delivery_cost) || 0;
            revenueMap.set(order.business_id, (revenueMap.get(order.business_id) || 0) + revenue);
          }
        });

        // Combine data
        return businesses.map(business => ({
          ...business,
          orderCount: orderCounts.get(business.id) || 0,
          totalRevenue: revenueMap.get(business.id) || 0
        }));
      },
      600000, // 10 minutes cache
      ['business', 'business_analytics']
    );
  }

  // Get active businesses only
  async getActiveBusinesses(options: { limit?: number; offset?: number } = {}): Promise<FindManyResult<Business>> {
    return this.findMany({
      where: { status: 'active' },
      orderBy: [{ column: 'created_at', ascending: false }],
      useCache: true,
      cacheTtl: 600000, // 10 minutes
      ...options
    });
  }

  // Search businesses by name or email
  async searchBusinesses(searchTerm: string, options: { limit?: number } = {}): Promise<Business[]> {
    const { limit = 20 } = options;
    
    const client = this.dbConnection.getConnection('read');
    const { data, error } = await client
      .from('business')
      .select('*')
      .or(`business_name.ilike.%${searchTerm}%, email.ilike.%${searchTerm}%`)
      .order('business_name')
      .limit(limit);

    if (error) throw error;
    return (data || []) as Business[];
  }

  // Update business status
  async updateStatus(businessId: string, status: 'active' | 'inactive'): Promise<Business> {
    const result = await this.update(businessId, { 
      status,
      updated_at: new Date().toISOString()
    });

    // Clear related caches
    this.cache.clearByTags(['business_analytics', `business:${businessId}`]);
    
    return result;
  }

  // Get business statistics
  async getBusinessStats() {
    const cacheKey = 'business_stats';
    
    return this.cache.get(
      cacheKey,
      async () => {
        const [
          totalCount,
          activeCount,
          inactiveCount,
          newThisMonth
        ] = await Promise.all([
          this.count(),
          this.count({ status: 'active' }),
          this.count({ status: 'inactive' }),
          this.count({
            created_at: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
            }
          })
        ]);

        return {
          total: totalCount,
          active: activeCount,
          inactive: inactiveCount,
          newThisMonth,
          activeRate: totalCount > 0 ? activeCount / totalCount : 0
        };
      },
      300000, // 5 minutes cache
      ['business_stats']
    );
  }

  // Bulk update wallet balances
  async updateWalletBalances(updates: Array<{ businessId: string; balance: number }>) {
    const client = this.dbConnection.getConnection('write');
    
    // Process in batches
    const batchSize = 50;
    const results: Business[] = [];
    
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      
      const updatePromises = batch.map(update => 
        client
          .from('business')
          .update({ 
            wallet_balance: update.balance,
            updated_at: new Date().toISOString()
          })
          .eq('id', update.businessId)
          .select()
          .single()
      );

      const batchResults = await Promise.all(updatePromises);
      
      batchResults.forEach(result => {
        if (result.error) throw result.error;
        if (result.data) results.push(result.data as Business);
      });
    }

    // Clear related caches
    this.cache.clearByTags(['business', 'business_analytics']);
    
    return results;
  }

  // Get businesses with low wallet balance
  async getBusinessesWithLowBalance(threshold = 1000): Promise<Business[]> {
    const cacheKey = `low_balance_businesses:${threshold}`;
    
    return this.cache.get(
      cacheKey,
      async () => {
        const result = await this.findMany({
          where: {
            wallet_balance: { lt: threshold },
            status: 'active'
          },
          orderBy: [{ column: 'wallet_balance', ascending: true }],
          limit: 100,
          useCache: false
        });
        
        return result.data;
      },
      180000, // 3 minutes cache
      ['business', 'low_balance']
    );
  }
}
