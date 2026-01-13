import { Controller, Get, Query, BadRequestException, NotFoundException, Req } from '@nestjs/common';
import { supabase } from '../auth/supabase.client';
import { LogisticsPartnerService } from './logistics-partner.service';
import { AppLogger } from '../utils/logger.service';

/**
 * External-facing tracking endpoint that allows Shopify/Woo users to track
 * with provider identifiers rather than internal order_id.
 *
 * GET /api/v1/shipment/tracking?id=<value>&idType=orderId|trackingNumber
 * - Defaults to orderId lookup, then falls back to trackingNumber
 */
@Controller('shipment')
export class TrackingFacadeController {
  private readonly logger = new AppLogger(TrackingFacadeController.name);

  constructor(private readonly partnerService: LogisticsPartnerService) {}

  @Get('tracking')
  async track(@Query('id') id: string, @Query('idType') idType: 'orderId' | 'trackingNumber' = 'orderId', @Req() req) {
    if (!id) throw new BadRequestException('Missing required query param: id');

    // Resolve businessId from headers (supports shopdomain, x-api-key, or dashboard JWT)
    let businessId: string | undefined;
    const apiKey = req.headers['x-api-key'];
    const authHeader = req.headers['authorization'];
    const shopdomain = req.headers['shopdomain'];

    if (shopdomain) {
      const { data: business, error } = await supabase
        .from('business')
        .select('id')
        .eq('shopdomain', shopdomain)
        .single();
      if (error || !business?.id) throw new BadRequestException('Invalid shopdomain or business not found');
      businessId = business.id;
    } else if (apiKey) {
      const { data: business, error } = await supabase
        .from('business')
        .select('id')
        .eq('api_key', apiKey)
        .single();
      if (error || !business?.id) throw new BadRequestException('Invalid API key or business not found');
      businessId = business.id;
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      // Prefer treating Bearer as store API key first
      const { data: businessByKey } = await supabase
        .from('business')
        .select('id')
        .eq('api_key', token)
        .single();
      if (businessByKey?.id) {
        businessId = businessByKey.id;
      } else {
        // Fallback: treat as Supabase user JWT
        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        if (userError || !userData?.user?.id) throw new BadRequestException('Invalid or expired token');
        const supabaseUserId = userData.user.id;
        const { data: business, error } = await supabase
          .from('business')
          .select('id')
          .or(`supabase_user_id.eq.${supabaseUserId},id.eq.${supabaseUserId}`)
          .single();
        if (error || !business?.id) throw new BadRequestException('Business not found for authenticated user');
        businessId = business.id;
      }
    } else {
      throw new BadRequestException('Missing authentication: provide shopdomain, x-api-key, or Bearer token');
    }

    // Find order by partner_response identifiers, scoped by business
    let order: any = null;
    const tryBy = async (field: 'orderId' | 'trackingNumber') => {
      const { data, error } = await supabase
        .from('order')
        .select('id, order_id, partner_id, partner_response')
        .eq('business_id', businessId)
        .contains('partner_response', { [field]: id })
        .maybeSingle();
      if (!error && data) return data;
      return null;
    };

    if (idType === 'orderId') {
      order = await tryBy('orderId');
      if (!order) order = await tryBy('trackingNumber');
    } else {
      order = await tryBy('trackingNumber');
      if (!order) order = await tryBy('orderId');
    }

    if (!order) throw new NotFoundException('Order not found for provided identifier');

    // Lookup partner name
    const { data: partner, error: partnerError } = await supabase
      .from('logistics_partner')
      .select('name')
      .eq('id', order.partner_id)
      .single();
    if (partnerError || !partner) throw new NotFoundException('Logistics partner not found');

    const partnerName = String(partner.name || '').toLowerCase();
    const adapterMap: Record<string, any> = {
      glovo: (this.partnerService as any)['glovoAdapter'],
      faramove: (this.partnerService as any)['faramoveAdapter'],
      fez: (this.partnerService as any)['fezAdapter'],
      gig: (this.partnerService as any)['gigAdapter'],
      dhl: (this.partnerService as any)['dhlAdapter'],
    };
    const adapter = adapterMap[partnerName];
    if (!adapter) throw new NotFoundException('No adapter for this partner');

    // Determine provider identifier to track with
    const providerOrderId = order.partner_response?.orderId || order.partner_response?.trackingNumber;
    if (!providerOrderId) throw new NotFoundException('No provider identifier available for tracking');

    const tracking = await adapter.trackOrder(providerOrderId);

    // Map to outward (contract-like) shape
    const trackingNumber = order.partner_response?.trackingNumber || providerOrderId;
    const status = tracking?.status || tracking?.statusDescription || 'unknown';
    const events = Array.isArray(tracking?.meta?.events)
      ? tracking.meta.events.map((e: any) => ({
          status: e.status || e.description || '',
          description: e.description || e.status || '',
          location: e.location || e.locationCode || '',
          timestamp: e.timestamp || (e.date && e.time ? `${e.date}T${e.time}` : undefined),
        }))
      : [];

    return {
      orderId: providerOrderId,
      trackingNumber,
      carrier: partnerName.toUpperCase(),
      status,
      trackingUrl: order.partner_response?.trackingUrl || null,
      events,
      estimatedDelivery: tracking?.meta?.estimatedDelivery || null,
    };
  }
}
