import { Controller, Get, Query, Param, Post, Body } from '@nestjs/common';
import { OrderRepository } from '../database/repositories/order.repository';
import { QueryOptimizerService } from '../database/query-optimizer.service';
import { DatabasePerformanceMonitor } from '../database/database-performance.service';

@Controller('orders')
export class OptimizedOrderController {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly queryOptimizer: QueryOptimizerService,
    private readonly performanceMonitor: DatabasePerformanceMonitor
  ) {}

  // Optimized analytics summary with caching
  @Get('analytics/summary')
  async getSummary(@Query('from') from?: string, @Query('to') to?: string, @Query('businessId') businessId?: string) {
    return this.performanceMonitor.monitorQuery(
      () => this.queryOptimizer.getBusinessAnalytics(
        businessId,
        from && to ? { from, to } : undefined
      ),
      'SELECT',
      'order'
    );
  }

  // Optimized order retrieval with pagination
  @Get()
  async getOrders(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('businessId') businessId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    if (search) {
      // Use optimized search
      return this.performanceMonitor.monitorQuery(
        () => this.orderRepository.searchOrders(search, businessId, { limit: Number(limit) }),
        'SELECT',
        'order'
      );
    }

    const dateRange = startDate && endDate ? { from: startDate, to: endDate } : undefined;

    return this.performanceMonitor.monitorQuery(
      () => this.orderRepository.findByBusinessId(businessId!, {
        status,
        dateRange,
        limit: Number(limit),
        offset: (Number(page) - 1) * Number(limit),
        useCache: true
      }),
      'SELECT',
      'order'
    );
  }

  // Get order by ID with caching
  @Get(':id')
  async getOrderById(@Param('id') id: string) {
    return this.performanceMonitor.monitorQuery(
      () => this.orderRepository.findOne(id, { useCache: true }),
      'SELECT',
      'order'
    );
  }

  // Optimized daily status analytics
  @Get('analytics/daily-status')
  async getDailyOrderStatus(@Query('businessId') businessId?: string) {
    const cacheKey = `daily_status:${businessId || 'all'}`;
    
    return this.performanceMonitor.monitorQuery(
      async () => {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        const orders = await this.orderRepository.findByBusinessId(businessId!, {
          dateRange: {
            from: sevenDaysAgo.toISOString(),
            to: now.toISOString()
          },
          limit: 10000, // Get all orders for the period
          useCache: true
        });

        // Process data in memory for better performance
        const chartData = [];
        for (let i = 6; i >= 0; i--) {
          const day = new Date(now);
          day.setDate(now.getDate() - i);
          const dayStr = day.toISOString().slice(0, 10);

          const dayOrders = orders.data.filter(order =>
            order.created_at && order.created_at.slice(0, 10) === dayStr
          );

          let delivered = 0;
          let pending = 0;
          
          dayOrders.forEach(order => {
            const status = (order.status || '').toLowerCase();
            if (status === 'delivered') {
              delivered++;
            } else {
              pending++;
            }
          });

          chartData.push({
            day: dayStr,
            delivered,
            pending
          });
        }

        return { chartData };
      },
      'SELECT',
      'order'
    );
  }

  // Optimized monthly status analytics
  @Get('analytics/monthly-status')
  async getMonthlyOrderStatus(@Query('businessId') businessId?: string) {
    return this.performanceMonitor.monitorQuery(
      async () => {
        const now = new Date();
        const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        
        const orders = await this.orderRepository.findByBusinessId(businessId!, {
          dateRange: {
            from: twelveMonthsAgo.toISOString(),
            to: now.toISOString()
          },
          limit: 50000, // Large limit for analytics
          useCache: true
        });

        const chartData = [];
        for (let i = 11; i >= 0; i--) {
          const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
          
          const monthOrders = orders.data.filter(order => {
            if (!order.created_at) return false;
            const orderDate = new Date(order.created_at);
            return orderDate >= month && orderDate < nextMonth;
          });
          
          let delivered = 0;
          let pending = 0;
          
          monthOrders.forEach(order => {
            const status = (order.status || '').toLowerCase();
            if (status === 'delivered') {
              delivered++;
            } else {
              pending++;
            }
          });
          
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const displayMonth = monthNames[month.getMonth()];
          
          chartData.push({
            day: displayMonth,
            delivered,
            pending,
            fullDate: month.toISOString().slice(0, 7)
          });
        }

        return { chartData };
      },
      'SELECT',
      'order'
    );
  }

  // Optimized yearly status analytics
  @Get('analytics/yearly-status')
  async getYearlyOrderStatus(@Query('businessId') businessId?: string) {
    return this.performanceMonitor.monitorQuery(
      async () => {
        const currentYear = new Date().getFullYear();
        const fiveYearsAgo = new Date(currentYear - 4, 0, 1);
        
        const orders = await this.orderRepository.findByBusinessId(businessId!, {
          dateRange: {
            from: fiveYearsAgo.toISOString(),
            to: new Date().toISOString()
          },
          limit: 100000, // Very large limit for multi-year data
          useCache: true
        });

        const chartData = [];
        for (let i = 4; i >= 0; i--) {
          const year = currentYear - i;
          const yearStart = new Date(year, 0, 1);
          const yearEnd = new Date(year + 1, 0, 1);
          
          const yearOrders = orders.data.filter(order => {
            if (!order.created_at) return false;
            const orderDate = new Date(order.created_at);
            return orderDate >= yearStart && orderDate < yearEnd;
          });
          
          let delivered = 0;
          let pending = 0;
          
          yearOrders.forEach(order => {
            const status = (order.status || '').toLowerCase();
            if (status === 'delivered') {
              delivered++;
            } else {
              pending++;
            }
          });
          
          chartData.push({
            day: year.toString(),
            delivered,
            pending
          });
        }

        return { chartData };
      },
      'SELECT',
      'order'
    );
  }

  // Batch status update endpoint
  @Post('batch-update-status')
  async batchUpdateStatus(@Body() body: { orderIds: string[]; status: string }) {
    const { orderIds, status } = body;
    
    return this.performanceMonitor.monitorQuery(
      () => this.orderRepository.updateOrderStatuses(orderIds, status),
      'UPDATE',
      'order'
    );
  }

  // Get recent orders for dashboard
  @Get('recent')
  async getRecentOrders(
    @Query('businessId') businessId?: string,
    @Query('limit') limit = 10
  ) {
    return this.performanceMonitor.monitorQuery(
      () => this.orderRepository.getRecentOrders(businessId, { 
        limit: Number(limit),
        useCache: true 
      }),
      'SELECT',
      'order'
    );
  }

  // Get order statistics
  @Get('analytics/stats')
  async getOrderStats(@Query('businessId') businessId?: string) {
    return this.performanceMonitor.monitorQuery(
      () => this.orderRepository.getOrderStats(businessId),
      'SELECT',
      'order'
    );
  }

  // Performance monitoring endpoint
  @Get('performance/stats')
  async getPerformanceStats() {
    return this.performanceMonitor.getPerformanceStats();
  }

  // Get query optimization recommendations
  @Get('performance/recommendations')
  async getOptimizationRecommendations() {
    return {
      recommendations: this.performanceMonitor.getOptimizationRecommendations(),
      queryDistribution: this.performanceMonitor.getQueryDistribution(),
      trends: this.performanceMonitor.getPerformanceTrends(24)
    };
  }
}
