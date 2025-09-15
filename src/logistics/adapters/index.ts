import { UnifiedQuoteRequest, ProviderQuote, OrderResponse, TrackingStatus } from '../types';

export abstract class LogisticsProviderAdapter {
  abstract getQuote(request: UnifiedQuoteRequest): Promise<ProviderQuote>;
  abstract createOrder(quoteId: string, request: UnifiedQuoteRequest): Promise<OrderResponse>;
  abstract trackOrder(orderId: string): Promise<TrackingStatus>;
  abstract cancelOrder(orderId: string): Promise<void>;
}

export { GlovoAdapter } from './glovo.adapter';
export { FaramoveAdapter } from './faramove.adapter';
export { FezAdapter } from './fez.adapter';
export { GigAdapter } from './gig.adapter';
