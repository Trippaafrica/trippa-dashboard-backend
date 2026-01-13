import { Injectable, Logger, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { supabase } from '../auth/supabase.client';
import { OrderRepository } from '../database/repositories/order.repository';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { TableUpdatesGateway } from '../gateways/table-updates.gateway';

interface ShipmentStatusUpdatePayload {
  eventType: string;
  status: string;
  externalOrderId: string;
  trackingNumber?: string;
  shopDomain: string;
  occurredAt: string;
}

interface ProcessResult {
  success: boolean;
  error?: string;
  ordersUpdated?: number;
}

@Injectable()
export class ProviderWebhookService {
  private readonly logger = new Logger(ProviderWebhookService.name);

  constructor(
    private readonly httpService: HttpService,
    @Inject(OrderRepository) private readonly orderRepository: OrderRepository,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly tableUpdatesGateway: TableUpdatesGateway
  ) {}

  /**
   * Process shipment status update and send webhooks to Shopify stores
   */
  async processShipmentStatusUpdate(
    payload: ShipmentStatusUpdatePayload
  ): Promise<ProcessResult> {
    try {
      // Find orders that match the external order ID (shopify_order_id)
      const { data: orders, error } = await supabase
        .from('order')
        .select(
          'id, order_id, shopify_order_id, status, partner_response, business_id'
        )
        .eq('shopify_order_id', payload.externalOrderId);

      if (error) {
        this.logger.error('Database error finding orders:', error);
        return { success: false, error: 'Database error finding orders' };
      }

      if (!orders || orders.length === 0) {
        this.logger.warn(
          `No orders found for Shopify order ID: ${payload.externalOrderId}`
        );
        return {
          success: false,
          error: 'No orders found for the given external order ID',
        };
      }

      let updatedCount = 0;

      // Process each order
      for (const order of orders) {
        try {
          // Update order status in database
          const { error: updateError } = await supabase
            .from('order')
            .update({
              status: payload.status,
              updated_at: new Date().toISOString(),
            })
            .eq('id', order.id);

          if (updateError) {
            this.logger.error(
              `Failed to update order ${order.id}:`,
              updateError
            );
            continue;
          }

          // Extract tracking number from partner_response
          const trackingNumber = this.extractTrackingNumber(
            order.partner_response,
            order.order_id
          );

          // Send webhook to Shopify
          await this.sendShopifyWebhook({
            eventType: payload.eventType,
            status: payload.status,
            externalOrderId: payload.externalOrderId,
            trackingNumber: trackingNumber,
            shopDomain: payload.shopDomain,
            occurredAt: payload.occurredAt || new Date().toISOString(),
          });

          // Emit real-time updates
          this.notificationsGateway.sendOrderStatusUpdate(
            order.order_id,
            payload.status
          );

          updatedCount++;
          this.logger.log(
            `Updated order ${order.order_id} to status: ${payload.status}`
          );
        } catch (orderError) {
          this.logger.error(`Error processing order ${order.id}:`, orderError);
        }
      }

      // Broadcast table update for dashboard refresh
      if (updatedCount > 0) {
        try {
          this.tableUpdatesGateway.broadcastTableUpdate('order', {
            orderNumbers: orders.map((o) => o.order_id),
            status: payload.status,
          });
        } catch (broadcastError) {
          this.logger.error(
            'Failed to broadcast table update:',
            broadcastError
          );
        }
      }

      return {
        success: true,
        ordersUpdated: updatedCount,
      };
    } catch (error) {
      this.logger.error('Error processing shipment status update:', error);
      return {
        success: false,
        error: 'Internal error processing status update',
      };
    }
  }

  /**
   * Send webhook notification to Shopify
   */
  private async sendShopifyWebhook(
    payload: ShipmentStatusUpdatePayload
  ): Promise<void> {
    try {
      // Note: This is a placeholder for sending webhooks TO Shopify
      // In practice, you would need Shopify webhook endpoints configured
      // This might involve updating fulfillment tracking info via Shopify Admin API

      this.logger.log(
        `Would send webhook to Shopify for order ${payload.externalOrderId}:`
      );
      this.logger.debug('Webhook payload for Shopify:', payload);

      // TODO: Implement actual Shopify API call here
      // Example might be updating fulfillment tracking:
      // await this.updateShopifyFulfillmentTracking(payload);
    } catch (error) {
      this.logger.error('Error sending webhook to Shopify:', error);
      // Don't throw here to avoid blocking the main flow
    }
  }

  /**
   * Extract tracking number from partner_response or use order_id as fallback
   */
  private extractTrackingNumber(partnerResponse: any, orderId: string): string {
    if (!partnerResponse) {
      return orderId;
    }

    // Try different possible fields in partner_response
    return (
      partnerResponse.orderId ||
      partnerResponse.trackingNumber ||
      partnerResponse.tracking_number ||
      partnerResponse.id ||
      orderId
    );
  }

  /**
   * Trigger webhook for existing orders when status changes
   * This method can be called from other parts of the system when order status updates
   */
  async triggerWebhookForOrder(
    orderId: string,
    newStatus: string
  ): Promise<void> {
    try {
      const { data: order, error } = await supabase
        .from('order')
        .select(
          'id, order_id, shopify_order_id, status, partner_response, business_id'
        )
        .eq('id', orderId)
        .single();

      if (error || !order) {
        this.logger.error(`Order not found for webhook trigger: ${orderId}`);
        return;
      }

      // Only process orders that have Shopify order ID
      if (!order.shopify_order_id) {
        this.logger.debug(
          `Order ${orderId} is not a Shopify order, skipping webhook`
        );
        return;
      }

      // Get shop domain - you might need to fetch this from business table or store it
      // For now, using a placeholder approach
      const shopDomain = await this.getShopDomainForBusiness(order.business_id);

      if (!shopDomain) {
        this.logger.warn(
          `No shop domain found for business ${order.business_id}`
        );
        return;
      }

      const trackingNumber = this.extractTrackingNumber(
        order.partner_response,
        order.order_id
      );

      await this.sendShopifyWebhook({
        eventType: 'shipment.status',
        status: newStatus,
        externalOrderId: order.shopify_order_id,
        trackingNumber: trackingNumber,
        shopDomain: shopDomain,
        occurredAt: new Date().toISOString(),
      });

      this.logger.log(
        `Triggered webhook for Shopify order: ${order.shopify_order_id}`
      );
    } catch (error) {
      this.logger.error(
        `Error triggering webhook for order ${orderId}:`,
        error
      );
    }
  }

  /**
   * Get shop domain for a business - placeholder implementation
   * You might need to extend the business table or create a separate shopify_stores table
   */
  private async getShopDomainForBusiness(
    businessId: string
  ): Promise<string | null> {
    try {
      // This is a placeholder - you might need to implement this based on your business model
      // Option 1: Store shop domain in business table
      // Option 2: Create a separate shopify_integrations table
      // Option 3: Extract from existing order data

      const { data: business, error } = await supabase
        .from('business')
        .select('shop_domain, business_name')
        .eq('id', businessId)
        .single();

      if (error || !business) {
        this.logger.error(`Business not found: ${businessId}`);
        return null;
      }

      // If shop_domain exists in business table, use it
      if (business.shop_domain) {
        return business.shop_domain;
      }

      // Fallback: try to extract from business name if it looks like a Shopify domain
      if (
        business.business_name &&
        business.business_name.includes('.myshopify.com')
      ) {
        return business.business_name;
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Error getting shop domain for business ${businessId}:`,
        error
      );
      return null;
    }
  }
}
