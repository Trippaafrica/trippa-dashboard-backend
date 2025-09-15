export type NotificationType = 'low_wallet_balance' | 'shipment_order_created' | 'shipment_order_delivered' | 'dispute_resolved';

export type Notification = {
  id: string;
  business_id: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  created_at: string;
};
