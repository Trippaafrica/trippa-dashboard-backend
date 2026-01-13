import { Controller, Get, Query, BadRequestException, Req } from '@nestjs/common';
import { supabase } from '../auth/supabase.client';

// Bearer apiKey analytics for shipments
// GET /api/v1/analytics/shipments?from=2025-10-01&to=2025-10-10
@Controller('analytics')
export class ShipmentAnalyticsController {
  private async resolveBusinessId(req: any): Promise<string> {
    const authHeader = req.headers['authorization'];
    const apiKeyHeader = req.headers['x-api-key'];
    const shopdomain = req.headers['shopdomain'];

    if (authHeader && String(authHeader).startsWith('Bearer ')) {
      const token = String(authHeader).replace('Bearer ', '');
      const { data: byKey } = await supabase
        .from('business')
        .select('id')
        .eq('api_key', token)
        .single();
      if (byKey?.id) return byKey.id;
    }

    if (apiKeyHeader) {
      const { data: byKey, error } = await supabase
        .from('business')
        .select('id')
        .eq('api_key', apiKeyHeader)
        .single();
      if (error || !byKey?.id) throw new BadRequestException('Invalid API key');
      return byKey.id;
    }

    if (shopdomain) {
      const { data: byShop, error } = await supabase
        .from('business')
        .select('id')
        .eq('shopdomain', shopdomain)
        .single();
      if (error || !byShop?.id) throw new BadRequestException('Invalid shopdomain');
      return byShop.id;
    }

    throw new BadRequestException('Missing authentication: provide Authorization Bearer <apiKey>, x-api-key, or shopdomain');
  }

  @Get('shipments')
  async getShipmentsAnalytics(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    const businessId = await this.resolveBusinessId(req);

    // Build date range filters
    const filters: any = supabase
      .from('order')
      .select('id, created_at, status, delivery_cost')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (from) filters.gte('created_at', new Date(from).toISOString());
    if (to) filters.lte('created_at', new Date(to).toISOString());

    const { data: orders, error } = await filters as any;
    if (error) throw new BadRequestException('Failed to fetch analytics');

    const totalShipments = (orders || []).length;
    const byStatus: Record<string, number> = {};
    let totalLogisticsCost = 0;
    let totalTrippaFee = 0;

    for (const o of orders || []) {
      const status = (o as any).status || 'unknown';
      byStatus[status] = (byStatus[status] || 0) + 1;
      const cost = (o as any).delivery_cost || {};
      totalLogisticsCost += Number(cost.logistic_delivery_cost || 0);
      totalTrippaFee += Number(cost.trippa_fee || 0);
    }

    return {
      summary: {
        totalShipments,
        byStatus,
        totalLogisticsCost,
        totalTrippaFee
      },
      range: {
        from: from ? new Date(from).toISOString() : null,
        to: to ? new Date(to).toISOString() : null
      }
    };
  }
}
