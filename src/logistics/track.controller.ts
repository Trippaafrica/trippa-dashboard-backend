import { Controller, Get, Param, NotFoundException, Req } from '@nestjs/common';
import { LogisticsPartnerService } from './logistics-partner.service';
import { supabase } from '../auth/supabase.client';
import { AppLogger } from '../utils/logger.service';

@Controller('logistics/track')
export class TrackController {
  private readonly logger = new AppLogger(TrackController.name);

  constructor(private readonly partnerService: LogisticsPartnerService) {}

  /**
   * Unified endpoint to track an order by its order_id (UUID or display ID)
   * Looks up the order, determines the provider, and calls the correct adapter's trackOrder method
   */
  @Get(':orderId')
  async trackOrder(@Param('orderId') orderId: string, @Req() req) {
    // Log the incoming payload
    this.logger.logTracking('Unified tracking API called', { orderId });

    // --- AUTHENTICATION BLOCK ---
    const apiKey = req.headers['x-api-key'];
    const authHeader = req.headers['authorization'];
    let businessId: string | undefined;
    if (apiKey) {
      // API key integration: lookup business by api_key
      const { data: business, error } = await supabase
        .from('business')
        .select('id')
        .eq('api_key', apiKey)
        .single();
      // Logging for debugging
      this.logger.logApiAuth('API key authentication for tracking', { 
        apiKey: apiKey?.substring(0, 10) + '...', 
        businessFound: !!business?.id 
      });
      if (error || !business?.id) {
        this.logger.error('Invalid API key or business not found', error);
        throw new NotFoundException('Invalid API key or business not found');
      }
      businessId = business.id;
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
    } else {
      throw new NotFoundException('Missing authentication: provide x-api-key or Bearer token');
    }
    // --- END AUTHENTICATION BLOCK ---

    // 1. Lookup the order in the DB (robust string match for order_id)
    let { data: order, error } = await supabase
      .from('order')
      .select('id, order_id, partner_id, partner_response')
      .eq('order_id', orderId)
      .single();
    if (error || !order) {
      // fallback: try by UUID id
      const fallback = await supabase
        .from('order')
        .select('id, order_id, partner_id, partner_response')
        .eq('id', orderId)
        .single();
      order = fallback.data;
      if (fallback.error || !order) {
        console.error('[Backend] Order not found for orderId:', orderId, '| error:', error, fallback.error);
        throw new NotFoundException('Order not found');
      }
    }
    // 2. Lookup the partner name
    const { data: partner, error: partnerError } = await supabase
      .from('logistics_partner')
      .select('name')
      .eq('id', order.partner_id)
      .single();
    if (partnerError || !partner) {
      throw new NotFoundException('Logistics partner not found');
    }
    const partnerName = partner.name.toLowerCase();
    // 3. Get the correct adapter
    const adapterMap = {
      glovo: this.partnerService['glovoAdapter'],
      faramove: this.partnerService['faramoveAdapter'],
      fez: this.partnerService['fezAdapter'],
      gig: this.partnerService['gigAdapter'],
      dhl: this.partnerService['dhlAdapter'],
    };
    const adapter = adapterMap[partnerName];
    if (!adapter) throw new NotFoundException('No adapter for this partner');
    // 4. Get the provider's order/tracking ID
    let providerOrderId = order.partner_response?.orderId || order.partner_response?.trackingNumber || order.order_id;
    if (!providerOrderId) providerOrderId = order.id;
    this.logger.logTracking('Routing to partner', { partnerName, providerOrderId });
    // 5. Call the adapter's trackOrder
    const tracking = await adapter.trackOrder(providerOrderId);
    return tracking;
  }
}
