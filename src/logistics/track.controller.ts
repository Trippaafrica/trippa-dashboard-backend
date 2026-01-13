import { Controller, Get, Param, NotFoundException, Req } from '@nestjs/common';
import { LogisticsPartnerService } from './logistics-partner.service';
import { supabase } from '../auth/supabase.client';
import { AppLogger } from '../utils/logger.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { TableUpdatesGateway } from '../gateways/table-updates.gateway';
import { ProviderWebhookService } from '../shopify-webhook/provider-webhook.service';

@Controller('logistics/track')
export class TrackController {
  private readonly logger = new AppLogger(TrackController.name);

  constructor(
    private readonly partnerService: LogisticsPartnerService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly tableUpdatesGateway: TableUpdatesGateway,
    private readonly providerWebhookService: ProviderWebhookService
  ) {}

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
    const shopdomain = req.headers['shopdomain'];
    let businessId: string | undefined;

    if (shopdomain) {
      // Shopify integration: lookup business by shopdomain
      const { data: business, error } = await supabase
        .from('business')
        .select('id')
        .eq('shopdomain', shopdomain)
        .single();
      this.logger.logApiAuth('Shopify authentication for tracking', {
        shopdomain,
        businessFound: !!business?.id,
      });
      if (error || !business?.id) {
        this.logger.error('Invalid shopdomain or business not found', error);
        throw new NotFoundException('Invalid shopdomain or business not found');
      }
      businessId = business.id;
    } else if (apiKey) {
      // API key integration: lookup business by api_key
      const { data: business, error } = await supabase
        .from('business')
        .select('id')
        .eq('api_key', apiKey)
        .single();
      this.logger.logApiAuth('API key authentication for tracking', {
        apiKey: apiKey?.substring(0, 10) + '...',
        businessFound: !!business?.id,
      });
      if (error || !business?.id) {
        this.logger.error('Invalid API key or business not found', error);
        throw new NotFoundException('Invalid API key or business not found');
      }
      businessId = business.id;
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      // Prefer treating Bearer as store API key first
      const token = authHeader.replace('Bearer ', '');
      const { data: businessByKey } = await supabase
        .from('business')
        .select('id')
        .eq('api_key', token)
        .single();
      if (businessByKey?.id) {
        businessId = businessByKey.id;
      } else {
        // Fallback: treat as Supabase user JWT
        const { data: userData, error: userError } =
          await supabase.auth.getUser(token);
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
          throw new NotFoundException(
            'Business not found for authenticated user'
          );
        }
        businessId = business.id;
      }
    } else {
      throw new NotFoundException(
        'Missing authentication: provide shopdomain, x-api-key, or Bearer token'
      );
    }
    // --- END AUTHENTICATION BLOCK ---

    // 1. Lookup the order in the DB (robust string match for order_id)
    let { data: order, error } = await supabase
      .from('order')
      .select('id, order_id, shopify_order_id, partner_id, partner_response')
      .eq('order_id', orderId)
      .single();
    if (error || !order) {
      // fallback: try by UUID id
      const fallback = await supabase
        .from('order')
        .select('id, order_id, shopify_order_id, partner_id, partner_response')
        .eq('id', orderId)
        .single();
      order = fallback.data;
      if (fallback.error || !order) {
        // Try by shopify_order_id for Shopify users
        if (shopdomain) {
          const shopifyOrder = await supabase
            .from('order')
            .select(
              'id, order_id, shopify_order_id, partner_id, partner_response'
            )
            .eq('shopify_order_id', orderId)
            .single();
          order = shopifyOrder.data;
          if (shopifyOrder.error || !order) {
            console.error(
              '[Backend] Order not found for shopify_order_id:',
              orderId,
              '| error:',
              error,
              fallback.error,
              shopifyOrder.error
            );
            throw new NotFoundException('Order not found');
          }
        } else {
          console.error(
            '[Backend] Order not found for orderId:',
            orderId,
            '| error:',
            error,
            fallback.error
          );
          throw new NotFoundException('Order not found');
        }
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
    let providerOrderId =
      order.partner_response?.orderId ||
      order.partner_response?.trackingNumber ||
      order.order_id;
    if (!providerOrderId) providerOrderId = order.id;
    this.logger.logTracking('Routing to partner', {
      partnerName,
      providerOrderId,
    });
    // 5. Call the adapter's trackOrder
    const tracking = await adapter.trackOrder(providerOrderId);

    // Persist latest provider status to DB and emit updates
    try {
      const latestStatus =
        tracking?.status || tracking?.meta?.order?.orderStatus || 'Unknown';
      if (latestStatus && order?.id) {
        const updateResp = await supabase
          .from('order')
          .update({ status: latestStatus })
          .eq('id', order.id)
          .select('id, order_id, status');

        if (!updateResp.error) {
          const updated = (updateResp.data as any[]) || [];
          if (updated.length) {
            const localOrderId = updated[0].order_id || updated[0].id;
            try {
              this.notificationsGateway.sendOrderStatusUpdate(
                String(localOrderId),
                latestStatus
              );
            } catch (e) {
              this.logger.error(
                'Failed to emit order status update via websocket',
                e
              );
            }
            try {
              this.tableUpdatesGateway.broadcastTableUpdate('order', {
                orderNumbers: [localOrderId],
                status: latestStatus,
              });
            } catch (e2) {
              this.logger.error('Failed to broadcast table update', e2);
            }

            // Trigger Shopify webhook if this is a Shopify order
            if (order.shopify_order_id) {
              this.providerWebhookService
                .triggerWebhookForOrder(order.id, latestStatus)
                .catch((err) => {
                  this.logger.error('Failed to trigger Shopify webhook', err);
                });
            }
          }
        } else {
          this.logger.error(
            'Failed to persist tracking status to DB',
            updateResp.error
          );
        }
      }
    } catch (persistErr) {
      this.logger.error('Error while persisting tracking status', persistErr);
    }

    return tracking;
  }
}
