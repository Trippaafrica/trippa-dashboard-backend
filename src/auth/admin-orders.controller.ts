import { Controller, Get, Query, Param, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { supabase } from './supabase.client';
import { AdminService } from './admin.service';

@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly adminService: AdminService) {}

  // Helper function to verify admin token
  private async verifyAdminToken(req: any): Promise<string> {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      throw new BadRequestException('Missing or invalid Authorization header');
    }
    
    const token = authHeader.replace('Bearer ', '');
    const adminProfile = await this.adminService.getAdminProfileByToken(token);
    
    if (adminProfile.error || !adminProfile.id) {
      throw new BadRequestException('Unauthorized: Admin access required');
    }
    
    return adminProfile.id;
  }

  // Admin: Get all orders across all businesses
  @Get()
  async getAllOrders(
    @Req() req,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('businessId') businessId?: string
  ) {
    // Verify admin authentication
    await this.verifyAdminToken(req);

    // Build query for all orders
    let query = supabase
      .from('order')
      .select(`
        *,
        business:business_id(id, business_name, email, phone)
      `, { count: 'exact' })
      .order('created_at', { ascending: false });

    // Apply filters
    if (businessId) {
      query = query.eq('business_id', businessId);
    }

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

    // Map statuses for uniform display - anything not 'delivered' is 'Pending'
    const mapStatus = (status: string) => {
      if (!status) return 'Pending';
      const s = status.toLowerCase();
      if (s === 'delivered') return 'Delivered';
      return 'Pending'; // All other statuses map to Pending
    };

    const mappedData = (data || []).map(order => ({
      ...order,
      status: mapStatus(order.status)
    }));

    return { 
      data: mappedData, 
      page: pageNum, 
      limit: limitNum, 
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limitNum)
    };
  }

  // Admin: Get single order by ID
  @Get(':id')
  async getOrderById(@Param('id') id: string, @Req() req) {
    // Verify admin authentication
    await this.verifyAdminToken(req);

    // Get the order with business information
    let { data: order, error } = await supabase
      .from('order')
      .select(`
        *,
        business:business_id(id, business_name, email, phone, wallet_balance)
      `)
      .eq('id', id)
      .single();

    if (error || !order) {
      // Try by order_id as fallback
      const { data: orderByOrderId, error: orderIdError } = await supabase
        .from('order')
        .select(`
          *,
          business:business_id(id, business_name, email, phone, wallet_balance)
        `)
        .eq('order_id', id)
        .single();

      if (orderIdError || !orderByOrderId) {
        throw new NotFoundException('Order not found');
      }
      order = orderByOrderId;
    }

    return order;
  }

  // Admin: Get order statistics
  @Get('analytics/stats')
  async getOrderStats(@Req() req) {
    // Verify admin authentication
    await this.verifyAdminToken(req);

    // Get all orders
    const { data: orders, error } = await supabase
      .from('order')
      .select('id, status, created_at, delivery_cost');

    if (error) throw error;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const stats = {
      totalOrders: orders?.length || 0,
      // Pending = anything that is NOT delivered
      pendingOrders: orders?.filter(o => {
        const s = o.status?.toLowerCase();
        return s !== 'delivered';
      }).length || 0,
      deliveredOrders: orders?.filter(o => o.status?.toLowerCase() === 'delivered').length || 0,
      ordersLast30Days: orders?.filter(o => new Date(o.created_at) >= thirtyDaysAgo).length || 0,
      ordersLast7Days: orders?.filter(o => new Date(o.created_at) >= sevenDaysAgo).length || 0,
      totalRevenue: orders?.reduce((sum, order) => {
        return sum + (Number(order.delivery_cost?.total_delivery_cost) || 0);
      }, 0) || 0,
      totalProfit: orders?.reduce((sum, order) => {
        return sum + (Number(order.delivery_cost?.trippa_fee) || 0);
      }, 0) || 0
    };

    return stats;
  }
}
