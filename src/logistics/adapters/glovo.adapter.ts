import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LogisticsProviderAdapter } from './index';
import { UnifiedQuoteRequest, ProviderQuote, OrderResponse, TrackingStatus } from '../types';
import { ProviderRateLimiterService } from '../../utils/provider-rate-limiter.service';
import { AppLogger } from '../../utils/logger.service';

@Injectable()
export class GlovoAdapter extends LogisticsProviderAdapter {
  private readonly logger = new AppLogger(GlovoAdapter.name);
  private token: string | null = null;
  private tokenExpiresAt: number = 0;
  private glovoBaseUrl = process.env.NODE_ENV === 'production' 
    ? (process.env.GLOVO_PRODUCTION_URL || 'https://api.glovoapp.com')
    : (process.env.GLOVO_BASE_URL || 'https://stageapi.glovoapp.com');

  constructor(
    private httpService: HttpService,
    private rateLimiter: ProviderRateLimiterService,
  ) {
    super();
  }

  private async getToken(): Promise<string> {
    // If token is valid for at least 1 minute, use it
    if (this.token && this.tokenExpiresAt - Date.now() > 60 * 1000) {
      return this.token;
    }
    const url = `${this.glovoBaseUrl}/oauth/token`;
    const body = {
      grantType: 'client_credentials',
      clientId: Number(process.env.GLOVO_CLIENT_ID),
      clientSecret: process.env.GLOVO_CLIENT_SECRET,
    };
    const resp = await firstValueFrom(this.httpService.post(url, body));
    this.token = resp.data?.accessToken;
    this.tokenExpiresAt = Date.now() + (resp.data?.expiresIn || 3600) * 1000;
    return this.token;
  }

  async getQuote(request: UnifiedQuoteRequest): Promise<ProviderQuote> {
    // Check rate limit before proceeding
    const isAllowed = await this.rateLimiter.checkRateLimit('glovo');
    if (!isAllowed) {
      const waitTime = this.rateLimiter.getTimeUntilReset('glovo');
      throw new Error(`Glovo rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    this.logger.logAdapter('glovo', 'getQuote called with request', request);
    const token = await this.getToken();
    const url = `${this.glovoBaseUrl}/v2/laas/quotes`;
    // Use meta.glovoAddressBookId for pickup addressBook.id
    const addressBookId = request.meta?.glovoAddressBookId ;
    this.logger.logAdapter('glovo', 'Using addressBookId', { addressBookId });
    
    // Wait for rate limit before making request
    await this.rateLimiter.waitForRateLimit('glovo');
    
    const body = {
      pickupDetails: {
        addressBook: {
          id: addressBookId,
        },
        // pickupTime omitted (optional)
      },
      deliveryAddress: {
        rawAddress: (request.delivery as any).formattedAddress || request.delivery.address,
        coordinates: request.delivery.coordinates
          ? { latitude: request.delivery.coordinates[0], longitude: request.delivery.coordinates[1] }
          : undefined,
        details: (request as any).deliveryDetails || '',
      },
    };
    const headers = { Authorization: `Bearer ${token}` };
    try {
      console.log('GlovoAdapter: Sending request to', url, 'with body:', body);
      const resp = await firstValueFrom(this.httpService.post(url, body, { headers }));
      const quote = resp.data;
      console.log('GlovoAdapter: Received response:', quote);
        // Use only the upperBound for estimatedDeliveryTime
        let estimatedDeliveryTime = '1 day';
        if (quote.estimatedTimeOfDelivery?.upperBound) {
          const upper = quote.estimatedTimeOfDelivery.upperBound.match(/PT(\d+)M/);
          if (upper) {
            const minutes = parseInt(upper[1], 10);
            if (minutes < 1440) {
              estimatedDeliveryTime = '1 day';
            } else {
              estimatedDeliveryTime = `${minutes} minutes`;
            }
          }
        }
      return {
        provider: 'glovo',
        price: quote.quotePrice || quote.price || 0,
        eta: estimatedDeliveryTime, // Use parsed delivery time for eta
        serviceType: 'standard',
        meta: {
          ...quote,
          quoteId: quote.quoteId || quote.id, // Ensure quoteId is available for order creation
          estimatedDeliveryTime, // Add human-readable delivery window for frontend display
        },
      };
    } catch (error) {
      console.error('GlovoAdapter: Error in getQuote:', error?.response?.data || error.message);
      throw new Error('Glovo quote failed: ' + (error?.response?.data?.message || error.message));
    }
  }

  async createOrder(quoteId: string, request: UnifiedQuoteRequest): Promise<OrderResponse> {
    // NOTE: We are deprecating quote-based creation and always using direct parcel creation.
    // The quoteId parameter is ignored for Glovo now.

    // Check rate limit before proceeding
    const isAllowed = await this.rateLimiter.checkRateLimit('glovo');
    if (!isAllowed) {
      const waitTime = this.rateLimiter.getTimeUntilReset('glovo');
      throw new Error(`Glovo rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    try {
      const token = await this.getToken();
      const url = `${this.glovoBaseUrl}/v2/laas/parcels`;

      // Wait for pacing (ensures spacing even if still under hard limit)
      await this.rateLimiter.waitForRateLimit('glovo');

      // Pickup mapping: Prefer addressBookId if supplied, else raw address & coords
      const addressBookId = request.meta?.glovoAddressBookId;
      const pickupCoordinates = request.pickup.coordinates
        ? { latitude: request.pickup.coordinates[0], longitude: request.pickup.coordinates[1] }
        : undefined;

      const deliveryCoordinates = request.delivery.coordinates
        ? { latitude: request.delivery.coordinates[0], longitude: request.delivery.coordinates[1] }
        : undefined;

      // Basic validation (lightweight – rely on provider for deep validation)
      const validationErrors: string[] = [];
      if (!request.delivery.customerName) validationErrors.push('delivery.customerName missing');
      if (!request.delivery.customerPhone) validationErrors.push('delivery.customerPhone missing');
      if (!request.item?.description) validationErrors.push('item.description missing');
      if (typeof request.item?.weight !== 'number' || request.item.weight <= 0) validationErrors.push('item.weight invalid');
      if (!addressBookId && !request.pickup.address) validationErrors.push('pickup address or addressBookId required');
      if (!request.delivery.address) validationErrors.push('delivery.address missing');
      if (validationErrors.length) {
        throw new Error('Validation failed: ' + validationErrors.join('; '));
      }

      // Construct direct parcel creation body (fields inferred from docs / existing quote mapping)
      const body: any = {
        pickupDetails: addressBookId
          ? { addressBook: { id: addressBookId } }
          : {
              rawAddress: (request as any).pickup?.formattedAddress || request.pickup.address,
              coordinates: pickupCoordinates,
            },
        deliveryAddress: {
          rawAddress: (request as any).delivery?.formattedAddress || request.delivery.address,
          coordinates: deliveryCoordinates,
          details: (request as any).deliveryDetails || '',
        },
        contact: {
          name: request.delivery.customerName,
          phone: request.delivery.customerPhone,
          email: (request as any).recipientEmail || '',
        },
        packageDetails: {
          contentType: 'GENERIC_PARCEL',
          description: request.item.description,
          parcelValue: request.item.value || 0,
          weight: request.item.weight,
          // Optional dimensions if provided
          ...(request.item.length && request.item.width && request.item.height
            ? {
                dimensions: {
                  length: request.item.length,
                  width: request.item.width,
                  height: request.item.height,
                },
              }
            : {}),
        },
        // Optional payment object / constraints could be added here; Glovo may infer pricing on creation
        // externalReference: could add custom internal ID if needed
      };

      // Idempotency key: stable within a short window to avoid duplicate orders on retries
      const idempotencyKey = `glovo-${request.delivery.customerPhone}-${Date.now().toString(36)}`;

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': idempotencyKey,
      };

      this.logger.logAdapter('glovo', 'createOrder (direct) URL', url);
      this.logger.logAdapter('glovo', 'createOrder (direct) payload', {
        ...body,
        contact: { // Masked for logs
          name: body.contact?.name,
          phone: body.contact?.phone?.replace(/.(?=.{4})/g, '*'),
          email: body.contact?.email ? body.contact.email.replace(/(.).+(@.*)/, '$1***$2') : undefined,
        },
      });

      const resp = await firstValueFrom(this.httpService.post(url, body, { headers }));
      const data = resp.data;
      this.logger.logAdapter('glovo', 'createOrder (direct) response', data);

      return {
        provider: 'glovo',
        orderId: data.trackingNumber?.toString() || data.orderCode || '',
        trackingNumber: data.trackingNumber?.toString() || '',
        status: data.status?.state || data.state || 'Pending',
      };
    } catch (error) {
      if (error?.response) {
        this.logger.error('[GlovoAdapter][createOrder] Glovo API error', error.response.data);
      } else {
        this.logger.error('[GlovoAdapter][createOrder] Error', error.message);
      }
      throw new Error('Glovo createOrder failed: ' + (error?.response?.data?.message || error.message));
    }
  }

  async trackOrder(orderId: string): Promise<TrackingStatus> {
    // Check rate limit before proceeding
    const isAllowed = await this.rateLimiter.checkRateLimit('glovo');
    if (!isAllowed) {
      const waitTime = this.rateLimiter.getTimeUntilReset('glovo');
      throw new Error(`Glovo rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    const token = await this.getToken();
    const url = `${this.glovoBaseUrl}/v2/laas/parcels/${orderId}/status`;
    const headers = { Authorization: `Bearer ${token}` };
    
    // Wait for rate limit before making request
    await this.rateLimiter.waitForRateLimit('glovo');
    
    const resp = await firstValueFrom(this.httpService.get(url, { headers }));
    const data = resp.data;
    const trackingData = {
      status: data?.state || 'Unknown',
      updatedAt: data?.updateTime || new Date().toISOString(),
      meta: data,
    };
    console.log('[GlovoAdapter] trackOrder response:', JSON.stringify(trackingData, null, 2));
    return trackingData;
  }

  async cancelOrder(orderId: string): Promise<void> {
    // Check rate limit before proceeding
    const isAllowed = await this.rateLimiter.checkRateLimit('glovo');
    if (!isAllowed) {
      const waitTime = this.rateLimiter.getTimeUntilReset('glovo');
      throw new Error(`Glovo rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    const token = await this.getToken();
    const url = `${this.glovoBaseUrl}/v2/laas/parcels/${orderId}/cancel`;
    const headers = { Authorization: `Bearer ${token}` };
    
    // Wait for rate limit before making request
    await this.rateLimiter.waitForRateLimit('glovo');
    
    await firstValueFrom(this.httpService.post(url, {}, { headers }));
  }
}
