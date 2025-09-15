
import { Controller, Post, Body, HttpCode, NotFoundException } from '@nestjs/common';
import { supabase } from '../auth/supabase.client';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { LogisticsPartnerService } from './logistics-partner.service';

@Controller('tracking/webhook')

export class TrackingWebhookController {
  constructor(
    private readonly notificationsGateway: NotificationsGateway,
    private readonly partnerService: LogisticsPartnerService
  ) {}

  @Post()
  @HttpCode(200)
  async handleTrackingUpdate(@Body() body: { orderId: string }) {
    if (!body.orderId) {
      return { error: 'Missing orderId' };
    }
    // 1. Lookup the order in the DB
    let { data: order, error } = await supabase
      .from('order')
      .select('id, order_id, partner_id, partner_response')
      .eq('order_id', body.orderId)
      .single();
    if (error || !order) {
      // fallback: try by UUID id
      const fallback = await supabase
        .from('order')
        .select('id, order_id, partner_id, partner_response')
        .eq('id', body.orderId)
        .single();
      order = fallback.data;
      if (fallback.error || !order) {
        return { error: 'Order not found' };
      }
    }
    // 2. Lookup the partner name
    const { data: partner, error: partnerError } = await supabase
      .from('logistics_partner')
      .select('name')
      .eq('id', order.partner_id)
      .single();
    if (partnerError || !partner) {
      return { error: 'Logistics partner not found' };
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
    if (!adapter) return { error: 'No adapter for this partner' };
    // 4. Get the provider's order/tracking ID
    let providerOrderId = order.partner_response?.orderId || order.partner_response?.trackingNumber || order.order_id;
    if (!providerOrderId) providerOrderId = order.id;
    // 5. Call the adapter's trackOrder
    const tracking = await adapter.trackOrder(providerOrderId);
    // 6. Emit websocket event for real-time update
    this.notificationsGateway.sendOrderStatusUpdate(body.orderId, tracking.status || 'Unknown');
    return { success: true, tracking };
  }
}
