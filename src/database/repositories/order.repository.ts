import { Injectable } from '@nestjs/common';
import { BaseRepository, FindManyResult } from '../base-repository.service';
import { DatabaseConnectionService } from '../database-connection.service';
import { CacheService } from '../cache.service';

export interface Order {
  id: string;
  order_id: string;
  business_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  delivery_cost: any;
  order_data: any;
}

@Injectable()
export class OrderRepository extends BaseRepository<Order> {
  constructor(
    dbConnection: DatabaseConnectionService,
    cache: CacheService
  ) {
    super(dbConnection, cache, 'order');
  }

  // Get orders by business with optimized query
  async findByBusinessId(
    businessId: string,
    options: {
      status?: string;
      dateRange?: { from: string; to: string };
      limit?: number;
      offset?: number;
      useCache?: boolean;
    } = {}
  ) {
    const { status, dateRange, limit = 10, offset = 0, useCache = true } = options;
    
    const where: any = { business_id: businessId };
    if (status) {
      where.status = status;
    }
    
    if (dateRange) {
      where.created_at = {
        gte: dateRange.from,
        lte: dateRange.to
      };
    }

    return this.findMany({
      select: `
        *,
        business:business_id(business_name, email)
      `,
      where,
      orderBy: [{ column: 'created_at', ascending: false }],
      limit,
      offset,
      useCache,
      cacheTtl: 300000, // 5 minutes
      connectionType: 'read'
    });
  }

  // Get order analytics for a business
  async getBusinessAnalytics(
    businessId: string,
    dateRange?: { from: string; to: string }
  ) {
    const cacheKey = `order_analytics:${businessId}:${JSON.stringify(dateRange)}`;
    
    return this.cache.get(
      cacheKey,
      async () => {
        const orders = await this.findByBusinessId(businessId, {
          dateRange,
          limit: 10000, // Get all orders for analytics
          useCache: false
        });

        const analytics = {
          totalOrders: orders.data.length,
          totalRevenue: 0,
          statusBreakdown: {} as Record<string, number>,
          monthlyTrends: {} as Record<string, { orders: number; revenue: number }>
        };

        orders.data.forEach(order => {
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
        });

        return analytics;
      },
      1800000, // 30 minutes cache
      ['order_analytics', `business:${businessId}`]
    );
  }

  // Search orders with full-text search
  async searchOrders(
    searchTerm: string,
    businessId?: string,
    options: { limit?: number; useCache?: boolean } = {}
  ) {
    const { limit = 20, useCache = false } = options;
    
    const client = this.dbConnection.getConnection('read');
    let query = client
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
      query = (query as any).eq('business_id', businessId);
    }

    // Search in multiple fields
    query = (query as any)
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

    return (data || []) as any[];
  }

  // Batch update order statuses
  async updateOrderStatuses(orderIds: string[], status: string) {
    return this.updateMany(
      { id: orderIds },
      { 
        status, 
        updated_at: new Date().toISOString() 
      }
    );
  }

  // Get orders by status with count
  async findByStatus(
    status: string,
    businessId?: string,
    options: { limit?: number; offset?: number } = {}
  ) {
    const { limit = 10, offset = 0 } = options;
    
    const where: any = { status };
    if (businessId) {
      where.business_id = businessId;
    }

    return this.findMany({
      where,
      orderBy: [{ column: 'created_at', ascending: false }],
      limit,
      offset,
      useCache: true,
      cacheTtl: 120000 // 2 minutes cache for status queries
    });
  }

  // Get recent orders for dashboard
  async getRecentOrders(
    businessId?: string,
    options: { limit?: number; useCache?: boolean } = {}
  ) {
    const { limit = 10, useCache = true } = options;
    
    const where = businessId ? { business_id: businessId } : {};

    return this.findMany({
      select: `
        id,
        order_id,
        status,
        created_at,
        delivery_cost,
        business:business_id(business_name)
      `,
      where,
      orderBy: [{ column: 'created_at', ascending: false }],
      limit,
      useCache,
      cacheTtl: 180000, // 3 minutes cache
      connectionType: 'read'
    });
  }

  // Get order statistics for dashboard
  async getOrderStats(businessId?: string) {
    const cacheKey = `order_stats:${businessId || 'all'}`;
    
    return this.cache.get(
      cacheKey,
      async () => {
        const where = businessId ? { business_id: businessId } : {};
        
        const [
          totalCount,
          pendingCount,
          deliveredCount,
          todayCount
        ] = await Promise.all([
          this.count(where),
          this.count({ ...where, status: 'pending' }),
          this.count({ ...where, status: 'delivered' }),
          this.count({
            ...where,
            created_at: {
              gte: new Date().toISOString().split('T')[0] // Today
            }
          })
        ]);

        return {
          total: totalCount,
          pending: pendingCount,
          delivered: deliveredCount,
          today: todayCount,
          completionRate: totalCount > 0 ? deliveredCount / totalCount : 0
        };
      },
      300000, // 5 minutes cache
      ['order_stats', businessId ? `business:${businessId}` : 'global']
    );
  }
}
