import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { supabase } from '../auth/supabase.client';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { TableUpdatesGateway } from '../gateways/table-updates.gateway';
import { ProviderWebhookService } from '../shopify-webhook/provider-webhook.service';

@Controller('fez/webhook')
export class FezWebhookController {
  constructor(
    private readonly notificationsGateway: NotificationsGateway,
    private readonly tableUpdatesGateway: TableUpdatesGateway,
    private readonly providerWebhookService: ProviderWebhookService
  ) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(@Body() body: any) {
    try {
      // Accept both `status` and `orderStatus` per Fez docs
      const orderNumber: string = body?.orderNumber;
      const status: string = body?.status || body?.orderStatus;

      if (!orderNumber || !status) {
        return { error: 'Missing orderNumber or status/orderStatus' };
      }

      // 1) Try update by partner_response->>orderId match
      const firstUpdate = await supabase
        .from('order')
        .update({ status })
        .eq('partner_response->>orderId', orderNumber)
        .select();

      if (firstUpdate.error) {
        return { error: firstUpdate.error.message };
      }

      let updatedRows: any[] = (firstUpdate.data as any[]) || [];

      // 2) If 0 rows updated, fallback to matching by order_id
      if (!updatedRows.length) {
        const secondUpdate = await supabase
          .from('order')
          .update({ status })
          .eq('order_id', orderNumber)
          .select();

        if (secondUpdate.error) {
          return { error: secondUpdate.error.message };
        }
        updatedRows = (secondUpdate.data as any[]) || [];
      }

      // Emit realtime updates for any updated rows
      if (updatedRows.length) {
        try {
          for (const row of updatedRows) {
            const localOrderId = row?.order_id || row?.id || orderNumber;
            // Notify specific order listeners
            this.notificationsGateway.sendOrderStatusUpdate(
              String(localOrderId),
              status
            );

            // Trigger Shopify webhook for orders that have shopify_order_id
            if (row?.shopify_order_id) {
              this.providerWebhookService
                .triggerWebhookForOrder(row.id, status)
                .catch((err) => {
                  console.error(
                    '[FezWebhookController] Failed to trigger Shopify webhook:',
                    err
                  );
                });
            }
          }
        } catch (emitErr) {
          // Log but do not fail the webhook
          console.error(
            '[FezWebhookController] WebSocket emit failed:',
            emitErr
          );
        }

        try {
          // Broadcast a generic table update for dashboards/grids
          this.tableUpdatesGateway.broadcastTableUpdate('order', {
            orderNumbers: updatedRows.map((r) => r.order_id || r.id),
            status,
          });
        } catch (emitErr2) {
          console.error(
            '[FezWebhookController] Table broadcast failed:',
            emitErr2
          );
        }
      }

      return { success: true, updatedCount: updatedRows.length };
    } catch (e: any) {
      console.error(
        '[FezWebhookController] Error handling webhook:',
        e?.message || e
      );
      return { error: e?.message || 'Unhandled error' };
    }
  }
}
