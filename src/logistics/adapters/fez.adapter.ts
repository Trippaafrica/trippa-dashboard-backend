import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LogisticsProviderAdapter } from './index';
import { UnifiedQuoteRequest, ProviderQuote, OrderResponse, TrackingStatus } from '../types';
import { ProviderRateLimiterService } from '../../utils/provider-rate-limiter.service';

interface FezAuth {
  authToken: string;
  secretKey: string;
  expiresAt: string;
}

@Injectable()
export class FezAdapter extends LogisticsProviderAdapter {
  private fezAuth: FezAuth | null = null;
  private fezUserId = process.env.FEZ_USER_ID;
  private fezPassword = process.env.FEZ_PASSWORD;
  private fezBaseUrl = process.env.FEZ_BASE_URL || 'https://apisandbox.fezdelivery.co/v1';

  constructor(
    private httpService: HttpService,
    private rateLimiter: ProviderRateLimiterService,
  ) {
    super();
  }

  // Validate the current Fez token by making a lightweight authenticated request
  private async validateToken(): Promise<boolean> {
    if (!this.fezAuth) return false;
    const url = `${this.fezBaseUrl}/order/cost`;
    const headers = {
      Authorization: `Bearer ${this.fezAuth.authToken}`,
      'secret-key': this.fezAuth.secretKey,
    };
    // Use a minimal payload for validation
    const body = {
      state: 'Lagos',
      pickUpState: 'Lagos',
      weight: 1,
    };
    try {
      await this.rateLimiter.waitForRateLimit('fez');
      await firstValueFrom(this.httpService.post(url, body, { headers }));
      return true;
    } catch (error) {
      // If unauthorized, token is invalid
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        return false;
      }
      // For other errors, assume token is valid (network, etc)
      return true;
    }
  }

  private async authenticate(): Promise<FezAuth> {
    // If token is valid for at least 5 minutes, use it
    if (this.fezAuth && new Date(this.fezAuth.expiresAt).getTime() - Date.now() > 5 * 60 * 1000) {
      // Validate token with Fez API
      const isValid = await this.validateToken();
      if (isValid) {
        return this.fezAuth;
      }
      // If not valid, clear token and re-authenticate
      this.fezAuth = null;
    }

    // Check rate limit before making authentication request
    await this.rateLimiter.waitForRateLimit('fez');

    const url = `${this.fezBaseUrl}/user/authenticate`;
    const payload = { user_id: this.fezUserId, password: this.fezPassword };
    const resp = await firstValueFrom(this.httpService.post(url, payload));
    const authDetails = resp.data?.authDetails;
    const orgDetails = resp.data?.orgDetails;
    this.fezAuth = {
      authToken: authDetails.authToken,
      secretKey: orgDetails['secret-key'],
      expiresAt: authDetails.expireToken,
    };
    return this.fezAuth;
  }

  async getQuote(request: UnifiedQuoteRequest): Promise<ProviderQuote> {
    console.log('FezAdapter: getQuote called with request:', request);
    
    // Check rate limit before proceeding
    const isAllowed = await this.rateLimiter.checkRateLimit('fez');
    if (!isAllowed) {
      const waitTime = this.rateLimiter.getTimeUntilReset('fez');
      throw new Error(`Fez rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    const auth = await this.authenticate();
    const fezCostUrl = `${this.fezBaseUrl}/order/cost`;
    const fezTimeUrl = `${this.fezBaseUrl}/delivery-time-estimate`;
    const headers = {
      Authorization: `Bearer ${auth.authToken}`,
      'secret-key': auth.secretKey,
    };
    // Prepare cost request
    const costBody = {
      state: request.delivery.state,
      pickUpState: request.pickup.state,
      weight: request.item.weight,
    };
    // Prepare time estimate request
    const timeBody = {
      delivery_type: 'local',
      pick_up_state: request.pickup.state,
      drop_off_state: request.delivery.state,
    };
    try {
      console.log('FezAdapter: Sending cost request to', fezCostUrl, 'with body:', costBody);
      
      // Wait for rate limit before cost request
      await this.rateLimiter.waitForRateLimit('fez');
      const costResp = await firstValueFrom(this.httpService.post(fezCostUrl, costBody, { headers }));
      console.log('FezAdapter: Cost response:', costResp.data);
      // Fix: extract price from costResp.data.Cost.cost
      const price = costResp.data?.Cost?.cost || 0;
      console.log('FezAdapter: Sending time estimate request to', fezTimeUrl, 'with body:', timeBody);
      
      // Wait for rate limit before time estimate request
      await this.rateLimiter.waitForRateLimit('fez');
      const timeResp = await firstValueFrom(this.httpService.post(fezTimeUrl, timeBody, { headers }));
      console.log('FezAdapter: Time response:', timeResp.data);
      // Fix: extract eta from timeResp.data.data.eta
      const eta = timeResp.data?.data?.eta || 'N/A';
      return {
        provider: 'fez',
        price,
        eta,
        serviceType: 'standard',
        meta: { fezCost: costResp.data, fezTime: timeResp.data },
      };
    } catch (error) {
      console.error('FezAdapter: Error in getQuote:', error?.response?.data || error.message);
      throw new Error('Fez quote failed: ' + (error?.response?.data?.message || error.message));
    }
  }

  async createOrder(quoteId: string, request: UnifiedQuoteRequest): Promise<OrderResponse> {
    // Check rate limit before proceeding
    const isAllowed = await this.rateLimiter.checkRateLimit('fez');
    if (!isAllowed) {
      const waitTime = this.rateLimiter.getTimeUntilReset('fez');
      throw new Error(`Fez rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    const auth = await this.authenticate();
    const fezOrderUrl = `${this.fezBaseUrl}/order`;
    const headers = {
      Authorization: `Bearer ${auth.authToken}`,
      'secret-key': auth.secretKey,
    };
    const batchId = `batch_${Date.now()}`;
    const orderBody = [{
      recipientAddress: request.delivery.address,
      recipientState: request.delivery.state,
      recipientName: request.delivery.customerName,
      recipientPhone: request.delivery.customerPhone,
      recipientEmail: (request as any).recipientEmail || '',
      uniqueID: quoteId, // now this is the internal order_id (UUID)
      BatchID: batchId,
      itemDescription: request.item.description,
      valueOfItem: request.item.value?.toString() || '',
      weight: request.item.weight,
      pickUpState: request.pickup.state,
      pickUpAddress: request.pickup.address,
    }];
    
    // Wait for rate limit before order creation request
    await this.rateLimiter.waitForRateLimit('fez');
    const resp = await firstValueFrom(this.httpService.post(fezOrderUrl, orderBody, { headers }));
    console.log('[FezAdapter] createOrder response body:', JSON.stringify(resp.data, null, 2));
    // Fez returns { status, description, orderNos: { [uuid]: fezOrderNo }, duplicateUniqueIds }
    let fezOrderNo = '';
    if (resp.data && resp.data.orderNos && typeof resp.data.orderNos === 'object') {
      const orderNos = resp.data.orderNos;
      // Get the first order number from the object
      fezOrderNo = String(Object.values(orderNos)[0] || '');
    }
    return {
      provider: 'fez',
      orderId: fezOrderNo,
      trackingNumber: fezOrderNo,
      status: resp.data?.status || 'Pending',
    };
  }

  async trackOrder(orderId: string): Promise<TrackingStatus> {
    // Check rate limit before proceeding
    const isAllowed = await this.rateLimiter.checkRateLimit('fez');
    if (!isAllowed) {
      const waitTime = this.rateLimiter.getTimeUntilReset('fez');
      throw new Error(`Fez rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    const auth = await this.authenticate();
    const fezTrackUrl = `${this.fezBaseUrl}/order/track/${orderId}`;
    const headers = {
      Authorization: `Bearer ${auth.authToken}`,
      'secret-key': auth.secretKey,
    };
    
    // Wait for rate limit before tracking request
    await this.rateLimiter.waitForRateLimit('fez');
    const resp = await firstValueFrom(this.httpService.get(fezTrackUrl, { headers }));
    const orderStatus = resp.data?.order?.orderStatus || resp.data?.meta?.order?.orderStatus;
    const trackingData = {
      status: orderStatus || resp.data?.status || 'Unknown',
      updatedAt: resp.data?.updatedAt || new Date().toISOString(),
      meta: resp.data,
    };
    console.log('[FezAdapter] trackOrder response:', JSON.stringify(trackingData, null, 2));
    return trackingData;
  }

  async cancelOrder(orderId: string): Promise<void> {
    // Check rate limit before proceeding
    const isAllowed = await this.rateLimiter.checkRateLimit('fez');
    if (!isAllowed) {
      const waitTime = this.rateLimiter.getTimeUntilReset('fez');
      throw new Error(`Fez rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    const auth = await this.authenticate();
    const fezCancelUrl = `${this.fezBaseUrl}/order`;
    const headers = {
      Authorization: `Bearer ${auth.authToken}`,
      'secret-key': auth.secretKey,
    };
    const body = [{ orderNo: orderId }];
    
    // Wait for rate limit before cancel request
    await this.rateLimiter.waitForRateLimit('fez');
    await firstValueFrom(this.httpService.delete(fezCancelUrl, { headers, data: body }));
  }
}
