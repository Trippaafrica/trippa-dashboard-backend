import { Injectable } from '@nestjs/common';
import { supabase } from '../auth/supabase.client';

@Injectable()
export class QueryOptimizerService {
  // Optimized business queries with proper indexing hints
  async getBusinessWithOrders(businessId: string) {
    // Single query with join instead of separate queries
    const { data, error } = await supabase
      .from('business')
      .select(`
        *,
        orders:order!business_id(
          id,
          status,
          created_at,
          delivery_cost
        )
      `)
      .eq('id', businessId)
      .single();

    if (error) throw error;
    return data;
  }

  // Optimized business analytics with aggregation
  async getBusinessAnalytics(businessId?: string, dateRange?: { from: string; to: string }) {
    let query = supabase
      .from('order')
      .select(`
        id,
        status,
        created_at,
        delivery_cost,
        business_id,
        business:business_id!inner(business_name)
      `);

    if (businessId) {
      query = query.eq('business_id', businessId);
    }

    if (dateRange) {
      query = query
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to);
    }

    // Order by created_at for better index usage
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    // Process analytics in memory instead of multiple DB queries
    const analytics = {
      totalOrders: data.length,
      totalRevenue: 0,
      statusBreakdown: {},
      monthlyTrends: {},
      businessBreakdown: {}
    };

    data.forEach(order => {
      // Revenue calculation
      if (order.delivery_cost?.total_delivery_cost) {
        analytics.totalRevenue += Number(order.delivery_cost.total_delivery_cost) || 0;
      }

      // Status breakdown
      const status = order.status || 'pending';
      analytics.statusBreakdown[status] = (analytics.statusBreakdown[status] || 0) + 1;

      // Monthly trends
      const month = order.created_at.substring(0, 7); // YYYY-MM
      if (!analytics.monthlyTrends[month]) {
        analytics.monthlyTrends[month] = { orders: 0, revenue: 0 };
      }
      analytics.monthlyTrends[month].orders += 1;
      analytics.monthlyTrends[month].revenue += Number(order.delivery_cost?.total_delivery_cost) || 0;

      // Business breakdown
      if (order.business && Array.isArray(order.business) && order.business.length > 0) {
        const businessName = order.business[0].business_name;
        if (!analytics.businessBreakdown[businessName]) {
          analytics.businessBreakdown[businessName] = { orders: 0, revenue: 0 };
        }
        analytics.businessBreakdown[businessName].orders += 1;
        analytics.businessBreakdown[businessName].revenue += Number(order.delivery_cost?.total_delivery_cost) || 0;
      }
    });

    return analytics;
  }

  // Optimized paginated orders with proper cursor-based pagination
  async getPaginatedOrders(
    businessId?: string,
    options: {
      page?: number;
      limit?: number;
      cursor?: string;
      search?: string;
      status?: string;
      dateRange?: { from: string; to: string };
    } = {}
  ) {
    const { page = 1, limit = 10, cursor, search, status, dateRange } = options;
    
    let query = supabase
      .from('order')
      .select(`
        *,
        business:business_id(business_name, email)
      `, { count: 'exact' });

    if (businessId) {
      query = query.eq('business_id', businessId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (dateRange) {
      query = query
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to);
    }

    if (search) {
      // Use full-text search if available, otherwise use ilike
      query = query.or(`
        order_id.ilike.%${search}%,
        order_data->request->delivery->>customerName.ilike.%${search}%
      `);
    }

    // Use cursor-based pagination for better performance
    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    // Order by indexed column
    query = query
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        hasNext: data.length === limit,
        nextCursor: data.length > 0 ? data[data.length - 1].created_at : null
      }
    };
  }

  // Batch operations for better performance
  async batchUpdateOrderStatus(orderIds: string[], status: string) {
    const { data, error } = await supabase
      .from('order')
      .update({ status, updated_at: new Date().toISOString() })
      .in('id', orderIds)
      .select();

    if (error) throw error;
    return data;
  }

  // Optimized dashboard stats with single query
  async getDashboardStats(businessId?: string) {
    let orderQuery = supabase
      .from('order')
      .select('id, status, created_at, delivery_cost, business_id');

    if (businessId) {
      orderQuery = orderQuery.eq('business_id', businessId);
    }

    const [ordersResult, businessesResult] = await Promise.all([
      orderQuery,
      businessId ? null : supabase.from('business').select('id, status')
    ]);

    if (ordersResult.error) throw ordersResult.error;
    if (businessesResult?.error) throw businessesResult.error;

    const orders = ordersResult.data || [];
    const businesses = businessesResult?.data || [];

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const stats = {
      totalOrders: orders.length,
      totalBusinesses: businesses.length,
      activeBusinesses: businesses.filter(b => b.status === 'active').length,
      pendingOrders: orders.filter(o => !o.status || o.status.toLowerCase() === 'pending').length,
      deliveredOrders: orders.filter(o => o.status?.toLowerCase() === 'delivered').length,
      ordersLast30Days: orders.filter(o => new Date(o.created_at) >= thirtyDaysAgo).length,
      ordersLast7Days: orders.filter(o => new Date(o.created_at) >= sevenDaysAgo).length,
      totalRevenue: orders.reduce((sum, order) => {
        return sum + (Number(order.delivery_cost?.total_delivery_cost) || 0);
      }, 0),
      revenueToday: orders
        .filter(o => o.created_at.startsWith(now.toISOString().split('T')[0]))
        .reduce((sum, order) => sum + (Number(order.delivery_cost?.total_delivery_cost) || 0), 0)
    };

    return stats;
  }

  // Optimized search with proper indexing
  async searchOrders(searchTerm: string, businessId?: string, limit = 20) {
    let query = supabase
      .from('order')
      .select(`
        id,
        order_id,
        status,
        created_at,
        order_data,
        business:business_id(business_name)
      `);

    if (businessId) {
      query = query.eq('business_id', businessId);
    }

    // Use PostgreSQL full-text search capabilities
    const searchQuery = searchTerm.split(' ').map(term => `${term}:*`).join(' & ');
    
    query = query
      .or(`
        order_id.ilike.%${searchTerm}%,
        order_data->request->delivery->>customerName.ilike.%${searchTerm}%,
        order_data->request->pickup->>address.ilike.%${searchTerm}%,
        order_data->request->delivery->>address.ilike.%${searchTerm}%
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    const { data, error } = await query;
    if (error) throw error;

    return data;
  }

  // Cache frequently accessed data
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  async getCachedData<T>(key: string, fetcher: () => Promise<T>, ttlMs = 300000): Promise<T> {
    const now = Date.now();
    const cached = this.cache.get(key);

    if (cached && now - cached.timestamp < cached.ttl) {
      return cached.data;
    }

    const data = await fetcher();
    this.cache.set(key, { data, timestamp: now, ttl: ttlMs });
    return data;
  }

  // Clear cache when data is updated
  clearCache(pattern?: string) {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  // Optimized logistics partner queries
  async getActiveLogisticsPartners() {
    return this.getCachedData(
      'active_logistics_partners',
      async () => {
        const { data, error } = await supabase
          .from('logistics_partner')
          .select('*')
          .eq('isActive', true)
          .order('name');
        
        if (error) throw error;
        return data;
      },
      600000 // 10 minutes cache
    );
  }

  // Database health and performance monitoring
  async getQueryPerformanceStats() {
    // This would require database monitoring setup
    return {
      slowQueries: [],
      indexUsage: {},
      connectionPool: {
        active: 0,
        idle: 0,
        waiting: 0
      }
    };
  }
}
