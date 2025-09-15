export interface CreateOrderDto {
  partner: string; // e.g. 'glovo', 'faramove', etc.
  partnerId?: string; // Partner ID from database or quote response (unified field)
  request: any; // Should match UnifiedQuoteRequest type
  order_id?: string; // Pass trippa id from scheduled shipment if available
}
// Core types and interfaces for the logistics aggregator

export interface UnifiedQuoteRequest {
  item: {
    description: string;
    weight: number;
    value?: number;
    /**
     * true for document, false for non-document (default: false)
     * This should be mapped directly from the frontend checkbox for DHL orders.
     */
    isDocument?: boolean;
    length?: number;
    width?: number;
    height?: number;
  };
  pickup: {
    address: string;
    city: string;
    state: string;
    countryCode: string;
    countryName: string;
    postalCode?: string;
    contactName?: string;
    contactPhone: string;
    coordinates?: [number, number];
  };
  delivery: {
    address: string;
    city: string;
    state: string;
    countryCode: string;
    countryName: string;
    postalCode?: string;
    customerName: string;
    customerPhone: string;
    coordinates?: [number, number];
  };
  // Optionally, add meta for advanced features (insurance, images, etc.)
  meta?: {
    images?: string[];
    additionalServices?: string[];
    insurance?: any;
    quote?: number;
    glovoAddressBookId?: string;
    businessId?: string;
    productCode?: string;
  };
}

export interface UnifiedAddress {
  address: string;
  state: string;
  city?: string;
  coordinates?: [number, number];
}

export interface ProviderQuote {
  partner?: string; // New unified field name
  provider?: string; // Legacy field for backwards compatibility with adapters
  partnerId?: string; // Unique identifier for the partner (for order creation)
  price: number; // Final price shown to customer (includes all fees)
  eta: string;
  serviceType?: string;
  // Standardized fields for unified response (added by aggregator)
  currency?: string; // Always 'NGN' for consistency
  estimatedDeliveryTime?: string; // Standardized ETA format
  serviceLevel?: 'economy' | 'standard' | 'express' | 'sameday'; // Standardized service levels
  meta?: any; // Essential metadata only (no pricing details)
}

export interface OrderResponse {
  partner?: string; // New unified field name
  provider?: string; // Legacy field for backwards compatibility with adapters
  orderId: string;
  trackingNumber: string;
  status: string;
  /**
   * Base64-encoded PDF label for DHL shipments (if available)
   */
  pdfLabel?: string;
}

export interface TrackingStatus {
  status: string;
  updatedAt: string;
  meta?: any;
}
