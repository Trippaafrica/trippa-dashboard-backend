
import { Controller, Get, Query, Req } from '@nestjs/common';
import { supabase } from '../auth/supabase.client';

@Controller('deliveries')
export class DeliveriesController {
  @Get()
  async getDeliveries(
    @Req() req,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    // Get businessId from headers (set by frontend)
    const businessId = req.headers['x-business-id'];
    if (!businessId) {
      return { data: [], page, limit, total: 0, error: 'Missing businessId' };
    }
    // Fetch deliveries for this business, ordered by most recent
    let query = supabase
      .from('order')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    // Date filtering
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    // If search param is provided, filter by customer name or order number
    if (search && search.trim() !== '') {
      // Supabase/Postgres: ilike for case-insensitive search
      // Try to match order_id or customerName in order_data.request.delivery.customerName
      // Note: Adjust field paths as needed for your schema
      query = query.or(`order_id.ilike.%${search}%,order_data->request->delivery->>customerName.ilike.%${search}%`);
    }

    // Pagination
    query = query.range((page - 1) * limit, page * limit - 1);

    const { data, error, count } = await query;
    if (error) {
      return { data: [], page, limit, total: 0, error: error.message };
    }
    // Map statuses for uniform frontend display
    const mapStatus = (status: string) => {
      if (!status) return 'Pending';
      const s = status.toLowerCase();
      if (['pending', 'pending pick-up', 'pending pickup', 'awaiting pickup'].includes(s)) return 'Pending';
      if (['on transit', 'in transit', 'in-transit', 'transit'].includes(s)) return 'In-Transit';
      if (['delivered'].includes(s)) return 'Delivered';
      return 'Pending'; // fallback
    };
    const mappedData = (data || []).map(order => ({
      ...order,
      status: mapStatus(order.status)
    }));
    return { data: mappedData, page, limit, total: count };
  }
}
