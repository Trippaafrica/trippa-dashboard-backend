import {
  Controller,
  Post,
  Body,
  HttpCode,
  Headers,
  Logger,
} from '@nestjs/common';
import { ProviderWebhookService } from './provider-webhook.service';

interface ShopifyShipmentWebhookPayload {
  eventType: string;
  status: string;
  externalOrderId: string;
  trackingNumber: string;
  shopDomain: string;
  occurredAt: string;
}

@Controller('provider/webhooks')
export class ProviderWebhookController {
  private readonly logger = new Logger(ProviderWebhookController.name);

  constructor(
    private readonly providerWebhookService: ProviderWebhookService
  ) {}

  @Post('shipments')
  @HttpCode(200)
  async handleShipmentWebhook(
    @Body() payload: ShopifyShipmentWebhookPayload,
    @Headers('shopdomain') shopDomain?: string
  ) {
    try {
      this.logger.log(
        `Received shipment webhook for shop: ${
          shopDomain || payload.shopDomain
        }`
      );
      this.logger.debug('Webhook payload:', payload);

      // Validate required fields
      if (!payload.eventType || !payload.externalOrderId || !payload.status) {
        this.logger.error('Missing required fields in webhook payload');
        return {
          error:
            'Missing required fields: eventType, externalOrderId, and status are required',
        };
      }

      // Validate event type
      if (payload.eventType !== 'shipment.status') {
        this.logger.warn(`Unsupported event type: ${payload.eventType}`);
        return {
          error: 'Only shipment.status events are supported',
        };
      }

      // Use shopDomain from header or payload
      const domain = shopDomain || payload.shopDomain;
      if (!domain) {
        this.logger.error('Missing shop domain in headers or payload');
        return {
          error:
            'Shop domain is required either in shopdomain header or payload',
        };
      }

      // Process the webhook
      const result =
        await this.providerWebhookService.processShipmentStatusUpdate({
          ...payload,
          shopDomain: domain,
        });

      if (result.success) {
        this.logger.log(
          `Successfully processed webhook for order: ${payload.externalOrderId}`
        );
        return {
          success: true,
          message: 'Webhook processed successfully',
          ordersUpdated: result.ordersUpdated,
        };
      } else {
        this.logger.error(`Failed to process webhook: ${result.error}`);
        return {
          error: result.error,
        };
      }
    } catch (error) {
      this.logger.error('Error processing shipment webhook:', error);
      return {
        error: 'Internal server error processing webhook',
      };
    }
  }

  @Post('test')
  @HttpCode(200)
  async testWebhook(@Body() payload: any, @Headers() headers: any) {
    this.logger.log('Test webhook received');
    this.logger.debug('Headers:', headers);
    this.logger.debug('Payload:', payload);

    return {
      success: true,
      message: 'Test webhook received successfully',
      timestamp: new Date().toISOString(),
      receivedPayload: payload,
      receivedHeaders: headers,
    };
  }
}
