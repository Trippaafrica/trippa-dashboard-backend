export interface ScheduledShipment {
  // Same core fields as Order table
  id: string;
  business_id: string;
  partner_id: number; // Changed from string to number to match logistics_partner table
  delivery_cost: {
    total_delivery_cost: number;
    trippa_fee: number;
    logistic_delivery_cost: number;
  }; // Same structure as order table
  order_data: any; // Same as order table - complete order request data
  partner_response?: any; // Will be populated when shipment is created
  status: 'scheduled' | 'processing' | 'created' | 'failed' | 'cancelled';
  order_id?: string; // Will be populated when shipment is created
  created_at: string;
  
  // Scheduling-specific fields
  scheduled_date: string; // ISO date string when shipment should be created
  quote_data: any; // Store the selected quote data for reference
  payment_processed: boolean; // Track if payment was deducted
  processed_at?: string;
  error_message?: string;
  updated_at: string;
}
