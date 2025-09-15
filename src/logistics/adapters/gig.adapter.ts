import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LogisticsProviderAdapter } from './index';
import { UnifiedQuoteRequest, ProviderQuote, OrderResponse, TrackingStatus } from '../types';
import { ProviderRateLimiterService } from '../../utils/provider-rate-limiter.service';

@Injectable()
export class GigAdapter extends LogisticsProviderAdapter {
  private apiKey: string | null = null;
  private customerCode: string;
  private customerType: number;
  private email: string;
  private password: string;
  private baseUrl: string;

  constructor(
    private httpService: HttpService,
    private rateLimiter: ProviderRateLimiterService,
  ) {
    super();
    this.customerCode = process.env.GIG_CUSTOMER_CODE || '';
    this.customerType = Number(process.env.GIG_CUSTOMER_TYPE) || 1;
    this.email = process.env.GIG_EMAIL || '';
    this.password = process.env.GIG_PASSWORD || '';
    this.baseUrl = process.env.NODE_ENV === 'production' 
      ? (process.env.GIG_PRODUCTION_URL || 'https://thirdpartynode.theagilitysystems.com')
      : (process.env.GIG_BASE_URL || 'https://dev-thirdpartynode.theagilitysystems.com');
  }

  private async authenticate(): Promise<string> {
    if (this.apiKey) {
      return this.apiKey;
    }
    const url = `${this.baseUrl}/login`;
    const body = { email: this.email, password: this.password };
    try {
      const resp = await firstValueFrom(this.httpService.post(url, body));
      const token = resp.data?.data?.['access-token'];
      if (!token) throw new Error('No access-token returned from GIG login');
      this.apiKey = token;
      return token;
    } catch (error) {
      console.error('GigAdapter: Error authenticating with GIG:', error?.response?.data || error.message);
      throw new Error('GIG authentication failed: ' + (error?.response?.data?.message || error.message));
    }
  }
  async getQuote(request: UnifiedQuoteRequest): Promise<ProviderQuote> {
    // Check rate limit before proceeding
    const isAllowed = await this.rateLimiter.checkRateLimit('gig');
    if (!isAllowed) {
      const waitTime = this.rateLimiter.getTimeUntilReset('gig');
      throw new Error(`GIG rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    console.log('GigAdapter: getQuote called with request:', request);
    const url = `${this.baseUrl}/price`;
    const apiKey = await this.authenticate();
    const headers = { 'access-token': apiKey };
    // Map unified request to GIG price request
    // Always geocode pickup and delivery addresses for quote
    const { getGeocodeData } = await import('../../utils/geocode.util');
    const pickupGeo = await getGeocodeData(request.pickup.address);
    const deliveryGeo = await getGeocodeData(request.delivery.address);
    
    // Wait for rate limit before making request
    await this.rateLimiter.waitForRateLimit('gig');
    
    const body = {
      SenderStationId: (request as any).senderStationId || 1,
      ReceiverStationId: (request as any).receiverStationId || 1,
      VehicleType: (request as any).vehicleType || 1,
      ReceiverLocation: deliveryGeo?.coordinates
        ? { Latitude: String(deliveryGeo.coordinates[0]), Longitude: String(deliveryGeo.coordinates[1]) }
        : { Latitude: '0', Longitude: '0' },
      SenderLocation: pickupGeo?.coordinates
        ? { Latitude: String(pickupGeo.coordinates[0]), Longitude: String(pickupGeo.coordinates[1]) }
        : { Latitude: '0', Longitude: '0' },
      IsFromAgility: false,
      CustomerCode: this.customerCode,
      CustomerType: this.customerType,
      DeliveryOptionIds: [2],
      Value: request.item.value || 0,
      PickUpOptions: 1,
      ShipmentItems: [
        {
          ItemName: request.item.description,
          Description: request.item.description,
          SpecialPackageId: 0,
          Quantity: 1,
          Weight: request.item.weight,
          IsVolumetric: false,
          Length: 0,
          Width: 0,
          Height: 0,
          ShipmentType: 1,
          Value: request.item.value || 0,
        },
      ],
    };
    try {
      console.log('GigAdapter: Sending request to', url, 'with body:', body);
      const resp = await firstValueFrom(this.httpService.post(url, body, { headers }));
      const data = resp.data?.data || {};
      console.log('GigAdapter: Received response:', data);
      // Always round up to 2 decimal points if there are values after the decimal point
      let price = data.GrandTotal || 0;
      if (typeof price === 'number') {
        const priceStr = price.toString();
        if (priceStr.includes('.')) {
          const [intPart, decPart] = priceStr.split('.');
          if (decPart && Number(decPart) > 0) {
            price = Math.ceil(price * 100) / 100;
          }
        }
        // Ensure 2 decimal places for consistency
        price = Number(price.toFixed(2));
      }
      return {
        provider: 'gig',
        price,
        eta: data.isWithinProcessingTime ? 'Same day' : 'N/A',
        serviceType: 'standard',
        meta: data,
      };
    } catch (error) {
      // If token is invalid/expired, clear and retry once
      if (error?.response?.data?.message === 'Invalid Token!') {
        this.apiKey = null;
        try {
          const retryApiKey = await this.authenticate();
          const retryResp = await firstValueFrom(this.httpService.post(url, body, { headers: { 'access-token': retryApiKey } }));
          const data = retryResp.data?.data || {};
          console.log('GigAdapter: Received response (after re-auth):', data);
          return {
            provider: 'gig',
            price: data.GrandTotal || 0,
            eta: data.isWithinProcessingTime ? 'Same day' : 'N/A',
            serviceType: 'standard',
            meta: data,
          };
        } catch (retryError) {
          console.error('GigAdapter: Error in getQuote after re-auth:', retryError?.response?.data || retryError.message);
          throw new Error('Gig quote failed after re-auth: ' + (retryError?.response?.data?.message || retryError.message));
        }
      }
      console.error('GigAdapter: Error in getQuote:', error?.response?.data || error.message);
      throw new Error('Gig quote failed: ' + (error?.response?.data?.message || error.message));
    }
  }

  async createOrder(quoteId: string, request: UnifiedQuoteRequest): Promise<OrderResponse> {
    // Check rate limit before proceeding
    const isAllowed = await this.rateLimiter.checkRateLimit('gig');
    if (!isAllowed) {
      const waitTime = this.rateLimiter.getTimeUntilReset('gig');
      throw new Error(`GIG rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    const url = process.env.GIG_PRESHIPMENT_URL || `${this.baseUrl}/capture/preshipment`;
    const apiKey = await this.authenticate();
    const headers = { 'access-token': apiKey };
    // Always geocode pickup and delivery addresses
    const { getGeocodeData } = await import('../../utils/geocode.util');
    const pickupGeo = await getGeocodeData(request.pickup.address);
    const deliveryGeo = await getGeocodeData(request.delivery.address);
    
    // Wait for rate limit before making request
    await this.rateLimiter.waitForRateLimit('gig');
    
    const body = {
      SenderDetails: {
        SenderLocation: pickupGeo?.coordinates
          ? { Latitude: String(pickupGeo.coordinates[0]), Longitude: String(pickupGeo.coordinates[1]) }
          : { Latitude: '0', Longitude: '0' },
        SenderName: (request as any).senderName || 'Sender',
        SenderPhoneNumber: request.pickup.contactPhone || '',
        SenderStationId: (request as any).senderStationId || 1,
        SenderAddress: pickupGeo?.formattedAddress || request.pickup.address,
        InputtedSenderAddress: request.pickup.address,
        SenderLocality: request.pickup.city || request.pickup.state || '',
      },
      ReceiverDetails: {
        ReceiverLocation: deliveryGeo?.coordinates
          ? { Latitude: String(deliveryGeo.coordinates[0]), Longitude: String(deliveryGeo.coordinates[1]), FormattedAddress: deliveryGeo?.formattedAddress || request.delivery.address }
          : { Latitude: '0', Longitude: '0', FormattedAddress: request.delivery.address },
        ReceiverStationId: (request as any).receiverStationId || 1,
        ReceiverName: request.delivery.customerName,
        ReceiverPhoneNumber: request.delivery.customerPhone,
        ReceiverAddress: deliveryGeo?.formattedAddress || request.delivery.address,
        InputtedReceiverAddress: request.delivery.address,
      },
      ShipmentDetails: {
        VehicleType: (request as any).vehicleType || 1,
        IsFromAgility: 0,
        IsBatchPickUp: 0,
      },
      ShipmentItems: [
        {
          ItemName: request.item.description || 'Item',
          SpecialPackageId: 0,
          Quantity: 1,
          Weight: request.item.weight || 1,
          IsVolumetric: false,
          Value: request.item.value || 0,
          ShipmentType: 1,
        },
      ],
    };
    const resp = await firstValueFrom(this.httpService.post(url, body, { headers }));
    const data = resp.data?.data || {};
    return {
      provider: 'gig',
      orderId: data.Waybill || '',
      trackingNumber: data.Waybill || '',
      status: 'Created',
    };
  }

  async trackOrder(orderId: string): Promise<TrackingStatus> {
    // Check rate limit before proceeding
    const isAllowed = await this.rateLimiter.checkRateLimit('gig');
    if (!isAllowed) {
      const waitTime = this.rateLimiter.getTimeUntilReset('gig');
      throw new Error(`GIG rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    const url = `${this.baseUrl}/track/mobileShipment?Waybill=${orderId}`;
    const apiKey = await this.authenticate();
    const headers = { 'access-token': apiKey };
    
    // Wait for rate limit before making request
    await this.rateLimiter.waitForRateLimit('gig');
    
    const resp = await firstValueFrom(this.httpService.get(url, { headers }));
    const data = Array.isArray(resp.data?.data) ? resp.data.data[0] : resp.data?.data;
    const trackingData = {
      status: data?.MobileShipmentTrackings?.[0]?.Status || 'Unknown',
      updatedAt: data?.MobileShipmentTrackings?.[0]?.DateTime || new Date().toISOString(),
      meta: data,
    };
    console.log('[GigAdapter] trackOrder response:', JSON.stringify(trackingData, null, 2));
    return trackingData;
  }

  async cancelOrder(orderId: string): Promise<void> {
    // GIG API does not support cancel, so throw error
    throw new Error('Cancel order is not supported for GIG.');
  }
}
