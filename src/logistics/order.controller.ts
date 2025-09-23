
import { Controller, Get, Query, Param, Post, Body, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderService } from './order.service';
import { supabase } from '../auth/supabase.client';

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}
  
  // Get orders list - supports both API key and JWT authentication
  @Get()
  async getOrders(
    @Req() req,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    // --- AUTHENTICATION BLOCK (same pattern as single order endpoint) ---
    const apiKey = req.headers['x-api-key'];
    const authHeader = req.headers['authorization'];
    let businessId: string | undefined;
    let isApiKeyAuth = false;
    
    if (apiKey) {
      // API key integration: lookup business by api_key
      const { data: business, error } = await supabase
        .from('business')
        .select('id')
        .eq('api_key', apiKey)
        .single();
      
      if (error || !business?.id) {
        throw new BadRequestException('Invalid API key or business not found');
      }
      businessId = business.id;
      isApiKeyAuth = true;
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      // Dashboard user: lookup business by supabase_user_id from token
      const token = authHeader.replace('Bearer ', '');
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userError || !userData?.user?.id) {
        throw new NotFoundException('Invalid or expired token');
      }
      const supabaseUserId = userData.user.id;
      const { data: business, error } = await supabase
        .from('business')
        .select('id')
        .eq('supabase_user_id', supabaseUserId)
        .single();
      if (error || !business?.id) {
        throw new NotFoundException('Business not found for authenticated user');
      }
      businessId = business.id;
      isApiKeyAuth = false;
    } else {
      throw new NotFoundException('Missing authentication: provide x-api-key or Bearer token');
    }
    // --- END AUTHENTICATION BLOCK ---

    // Build query for the business's orders
    let query = supabase
      .from('order')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }
    
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    // Search functionality
    if (search && search.trim() !== '') {
      query = query.or(`order_id.ilike.%${search}%,order_data->request->delivery->>customerName.ilike.%${search}%`);
    }

    // Pagination
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit))); // Max 100 per page
    query = query.range((pageNum - 1) * limitNum, pageNum * limitNum - 1);

    const { data, error, count } = await query;
    
    if (error) {
      throw new NotFoundException('Failed to fetch orders: ' + error.message);
    }

    // Map statuses for uniform display (same logic as deliveries controller)
    const mapStatus = (status: string) => {
      if (!status) return 'Pending';
      const s = status.toLowerCase();
      if (['pending', 'pending pick-up', 'pending pickup', 'awaiting pickup'].includes(s)) return 'Pending';
      if (['on transit', 'in transit', 'in-transit', 'transit'].includes(s)) return 'In-Transit';
      if (['delivered'].includes(s)) return 'Delivered';
      return 'Pending'; // fallback
    };

    const mappedData = (data || []).map(order => {
      const mappedOrder = {
        ...order,
        status: mapStatus(order.status)
      };
      
      // Filter sensitive data for API key users
      return isApiKeyAuth ? this.filterOrderForApiKey(mappedOrder) : mappedOrder;
    });

    return { 
      data: mappedData, 
      page: pageNum, 
      limit: limitNum, 
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limitNum)
    };
  }

  // ...existing code...
  // Summary: total revenue, total profit
  @Get('analytics/summary')
  async getSummary(@Query('from') from?: string, @Query('to') to?: string) {
    let query = supabase.from('order').select('delivery_cost, created_at, order_data, business_id, business:business_id (business_name)');
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);
    const { data, error } = await query;
    if (error) throw error;
    let totalRevenue = 0;
    let totalProfit = 0;
    const storeRevenue = {};
    for (const order of data || []) {
      if (order.delivery_cost && typeof order.delivery_cost === 'object') {
        if (order.delivery_cost.total_delivery_cost) {
          totalRevenue += Number(order.delivery_cost.total_delivery_cost) || 0;
        }
        if (order.delivery_cost.trippa_fee) {
          totalProfit += Number(order.delivery_cost.trippa_fee) || 0;
        }
      }
      // Use joined business name if available
      let businessName = '';
      if (order.business) {
        if (Array.isArray(order.business)) {
          if (order.business[0] && order.business[0].business_name) {
            businessName = order.business[0].business_name;
          }
        } else if (
          typeof order.business === 'object' &&
          order.business !== null &&
          'business_name' in order.business &&
          typeof (order.business as any).business_name === 'string'
        ) {
          businessName = (order.business as any).business_name;
        }
      } else if (order.order_data && typeof order.order_data === 'object') {
        businessName = order.order_data.businessName || order.order_data.business_id || '';
      }
      if (businessName) {
        if (!storeRevenue[businessName]) storeRevenue[businessName] = 0;
        if (order.delivery_cost && order.delivery_cost.total_delivery_cost) {
          storeRevenue[businessName] += Number(order.delivery_cost.total_delivery_cost) || 0;
        }
      }
    }
    // Get top 5 stores by revenue
    const topStores = Object.entries(storeRevenue)
      .map(([name, revenue]) => ({ name, revenue: Number(revenue) }))
      .sort((a, b) => Number(b.revenue) - Number(a.revenue))
      .slice(0, 5);


    // Add totalOrders for frontend
    const totalOrders = Array.isArray(data) ? data.length : 0;

    // Build daily chart data for the last 7 days
    const chartData = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(now.getDate() - i);
      const dayStr = day.toISOString().slice(0, 10);
      // Filter orders for this day
      const dayOrders = (data || []).filter(order =>
        order.created_at && order.created_at.slice(0, 10) === dayStr
      );
      let dayRevenue = 0;
      let dayProfit = 0;
      for (const order of dayOrders) {
        if (order.delivery_cost && typeof order.delivery_cost === 'object') {
          if (order.delivery_cost.total_delivery_cost) {
            dayRevenue += Number(order.delivery_cost.total_delivery_cost) || 0;
          }
          if (order.delivery_cost.trippa_fee) {
            dayProfit += Number(order.delivery_cost.trippa_fee) || 0;
          }
        }
      }
      chartData.push({
        date: dayStr,
        revenue: dayRevenue,
        profit: dayProfit,
      });
    }

    return { totalRevenue, totalProfit, topStores, totalOrders, chartData };
  }
  // Helper function to filter delivery cost for API key users
  private filterDeliveryCostForApiKey(deliveryCost: any): any {
    if (!deliveryCost || typeof deliveryCost !== 'object') {
      return deliveryCost;
    }
    
    // Create a copy without trippa_fee and logistic_delivery_cost
    const { trippa_fee, logistic_delivery_cost, ...filteredCost } = deliveryCost;
    return filteredCost;
  }

  // Helper function to filter order data for API key users
  private filterOrderForApiKey(order: any): any {
    if (!order) return order;
    
    const filteredOrder = { ...order };
    
    // Filter delivery_cost to hide internal cost breakdown
    if (filteredOrder.delivery_cost) {
      filteredOrder.delivery_cost = this.filterDeliveryCostForApiKey(filteredOrder.delivery_cost);
    }
    
    return filteredOrder;
  }

  // Get order by ID - supports both API key and JWT authentication
  @Get(':id')
  async getOrderById(@Param('id') id: string, @Req() req) {
    // --- AUTHENTICATION BLOCK (same pattern as tracking endpoint) ---
    const apiKey = req.headers['x-api-key'];
    const authHeader = req.headers['authorization'];
    const shopdomain = req.headers['shopdomain'];
    let businessId: string | undefined;
    let isApiKeyAuth = false;
    let isShopifyAuth = false;

    if (apiKey) {
      // API key integration: lookup business by api_key
      const { data: business, error } = await supabase
        .from('business')
        .select('id')
        .eq('api_key', apiKey)
        .single();
      if (error || !business?.id) {
        throw new BadRequestException('Invalid API key or business not found');
      }
      businessId = business.id;
      isApiKeyAuth = true;
    } else if (shopdomain) {
      // Shopify integration: lookup business by shopdomain
      const { data: business, error } = await supabase
        .from('business')
        .select('id')
        .eq('shopdomain', shopdomain)
        .single();
      if (error || !business?.id) {
        throw new BadRequestException('Invalid shopdomain or business not found');
      }
      businessId = business.id;
      isShopifyAuth = true;
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      // Dashboard user: lookup business by supabase_user_id from token
      const token = authHeader.replace('Bearer ', '');
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userError || !userData?.user?.id) {
        throw new NotFoundException('Invalid or expired token');
      }
      const supabaseUserId = userData.user.id;
      const { data: business, error } = await supabase
        .from('business')
        .select('id')
        .or(`supabase_user_id.eq.${supabaseUserId},id.eq.${supabaseUserId}`)
        .single();
      if (error || !business?.id) {
        throw new NotFoundException('Business not found for authenticated user');
      }
      businessId = business.id;
      isApiKeyAuth = false;
    } else {
      throw new NotFoundException('Missing authentication: provide x-api-key, shopdomain, or Bearer token');
    }
    // --- END AUTHENTICATION BLOCK ---

    // Get the order and verify it belongs to the authenticated business
    let { data: order, error } = await supabase
      .from('order')
      .select('*')
      .eq('id', id)
      .eq('business_id', businessId)
      .single();

    if (error || !order) {
      // Try by order_id as fallback (for custom order IDs)
      const { data: orderByOrderId, error: orderIdError } = await supabase
        .from('order')
        .select('*')
        .eq('order_id', id)
        .eq('business_id', businessId)
        .single();

      if (orderIdError || !orderByOrderId) {
        // Try by shopify_order_id for Shopify users
        if (isShopifyAuth) {
          const { data: orderByShopifyId, error: shopifyIdError } = await supabase
            .from('order')
            .select('*')
            .eq('shopify_order_id', id)
            .eq('business_id', businessId)
            .single();
          if (shopifyIdError || !orderByShopifyId) {
            throw new NotFoundException('Order not found or access denied');
          }
          order = orderByShopifyId;
        } else {
          throw new NotFoundException('Order not found or access denied');
        }
      } else {
        order = orderByOrderId;
      }
    }

    // --- STATUS SYNC LOGIC ---
    // Only sync if order has a partner/provider and partner_response
    try {
      const partnerName = (order.partner || order.provider || (order.partner_response && order.partner_response.partner))?.toLowerCase();
      const partnerOrderId = order.partner_response?.orderId || order.partner_response?.trackingNumber || order.order_id;
      if (partnerName && partnerOrderId) {
        // Get the correct adapter from LogisticsPartnerService
        // You may need to inject LogisticsPartnerService in the constructor
        const adapter = this["logisticsPartnerService"]?.getAdapterByName?.(partnerName);
        if (adapter && typeof adapter.trackOrder === "function") {
          const tracking = await adapter.trackOrder(partnerOrderId);
          if (tracking?.status && tracking.status !== order.status) {
            // Update status in DB
            await supabase
              .from('order')
              .update({ status: tracking.status })
              .eq('id', order.id);
            order.status = tracking.status;
          }
        }
      }
    } catch (syncErr) {
      // Log but do not block response
      console.error('[OrderController] Failed to sync order status:', syncErr);
    }

    // Filter sensitive data for API key users
    return isApiKeyAuth ? this.filterOrderForApiKey(order) : order;
  }

    // Get daily order status counts for the last 7 days
  @Get('analytics/daily-status')
  async getDailyOrderStatus(@Query('businessId') businessId?: string) {
    // Fetch all orders for the business (if businessId provided) or all orders
    let query = supabase.from('order').select('id, created_at, status, business_id');
    if (businessId) query = query.eq('business_id', businessId);
    const { data, error } = await query;
    if (error) throw error;

    // Build daily chart data for the last 7 days
    const chartData = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(now.getDate() - i);
      const dayStr = day.toISOString().slice(0, 10);
      // Filter orders for this day
      const dayOrders = (data || []).filter(order =>
        order.created_at && order.created_at.slice(0, 10) === dayStr
      );
      let delivered = 0;
      let pending = 0;
      for (const order of dayOrders) {
        const status = (order.status || '').toLowerCase();
        if (status === 'delivered') {
          delivered++;
        } else {
          pending++;
        }
      }
      chartData.push({
        day: dayStr,
        delivered,
        pending,
      });
    }
    return { chartData };
  }

  // Get monthly order status counts for the last 12 months
  @Get('analytics/monthly-status')
  async getMonthlyOrderStatus(@Query('businessId') businessId?: string) {
    // Fetch all orders for the business (if businessId provided) or all orders
    let query = supabase.from('order').select('id, created_at, status, business_id');
    if (businessId) query = query.eq('business_id', businessId);
    const { data, error } = await query;
    if (error) throw error;

    // Build monthly chart data for the last 12 months
    const chartData = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = month.toISOString().slice(0, 7); // YYYY-MM format
      const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
      
      // Filter orders for this month
      const monthOrders = (data || []).filter(order => {
        if (!order.created_at) return false;
        const orderDate = new Date(order.created_at);
        return orderDate >= month && orderDate < nextMonth;
      });
      
      let delivered = 0;
      let pending = 0;
      for (const order of monthOrders) {
        const status = (order.status || '').toLowerCase();
        if (status === 'delivered') {
          delivered++;
        } else {
          pending++;
        }
      }
      
      // Format month name for display (e.g., "Jan", "Feb")
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const displayMonth = monthNames[month.getMonth()];
      
      chartData.push({
        day: displayMonth, // Using 'day' key for compatibility with frontend
        delivered,
        pending,
        fullDate: monthStr // Keep full date for reference
      });
    }
    return { chartData };
  }

  // Get yearly order status counts for the last 5 years
  @Get('analytics/yearly-status')
  async getYearlyOrderStatus(@Query('businessId') businessId?: string) {
    // Fetch all orders for the business (if businessId provided) or all orders
    let query = supabase.from('order').select('id, created_at, status, business_id');
    if (businessId) query = query.eq('business_id', businessId);
    const { data, error } = await query;
    if (error) throw error;

    // Build yearly chart data for the last 5 years
    const chartData = [];
    const currentYear = new Date().getFullYear();
    for (let i = 4; i >= 0; i--) {
      const year = currentYear - i;
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year + 1, 0, 1);
      
      // Filter orders for this year
      const yearOrders = (data || []).filter(order => {
        if (!order.created_at) return false;
        const orderDate = new Date(order.created_at);
        return orderDate >= yearStart && orderDate < yearEnd;
      });
      
      let delivered = 0;
      let pending = 0;
      for (const order of yearOrders) {
        const status = (order.status || '').toLowerCase();
        if (status === 'delivered') {
          delivered++;
        } else {
          pending++;
        }
      }
      
      chartData.push({
        day: year.toString(), // Using 'day' key for compatibility with frontend
        delivered,
        pending,
        fullDate: year.toString() // Keep full date for reference
      });
    }
    return { chartData };
  }
}
