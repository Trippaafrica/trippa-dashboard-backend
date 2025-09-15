import { Injectable } from '@nestjs/common';
import { supabase } from '../auth/supabase.client';
import { FezAdapter } from './adapters/fez.adapter';

@Injectable()
export class FezStatusSyncService {
  constructor(private fezAdapter: FezAdapter) {}

  /**
   * Fetches the latest status from Fez and updates the delivery table for the given order.
   * @param fezOrderId The Fez order number (e.g., CYNO14072536)
   * @param localOrderId The local order UUID (optional, for easier lookup)
   */
  async syncFezOrderStatus(fezOrderId: string, localOrderId?: string) {
    // 1. Fetch status from Fez
    const tracking = await this.fezAdapter.trackOrder(fezOrderId);
    const fezStatus = tracking.meta?.orderDetails?.[0]?.orderStatus || tracking.status;

    // 2. Update your delivery/order table with the new status
    const { data, error } = await supabase
      .from('order')
      .update({ status: fezStatus })
      .eq('partner_response->>orderId', fezOrderId)
      .select();
    if (error) {
      console.error(`[FezStatusSyncService] Failed to update status for Fez order ${fezOrderId}:`, error.message);
    } else {
      const affectedRows = Array.isArray(data) ? data.length : 0;
      console.log(`[FezStatusSyncService] Updated status for Fez order ${fezOrderId} to '${fezStatus}'. Rows affected: ${affectedRows}`);
      if (affectedRows === 0) {
        console.warn(`[FezStatusSyncService] No rows updated for Fez order ${fezOrderId}. Check if partner_response->>orderId matches.`);
      }
      // Emit websocket event for real-time update (if NotificationsGateway is available)
      try {
        if (data && data[0] && global.notificationsGateway) {
          const orderId = data[0].id || data[0].order_id || fezOrderId;
          global.notificationsGateway.sendOrderStatusUpdate(orderId, fezStatus);
          console.log(`[FezStatusSyncService] Emitted websocket status update for orderId: ${orderId}, status: ${fezStatus}`);
        }
      } catch (emitErr) {
        console.error(`[FezStatusSyncService] Failed to emit websocket status update:`, emitErr);
      }
    }
    return fezStatus;
  }
}
