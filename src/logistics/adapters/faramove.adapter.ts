import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LogisticsProviderAdapter } from './index';
import { UnifiedQuoteRequest, ProviderQuote, OrderResponse, TrackingStatus } from '../types';
import { FaramoveDataService } from '../cache/faramove-data.service';
import { GeocodeService } from '../../utils/geocode.service';
import { ProviderRateLimiterService } from '../../utils/provider-rate-limiter.service';
import { AppLogger } from '../../utils/logger.service';

@Injectable()
export class FaramoveAdapter extends LogisticsProviderAdapter {
  private readonly logger = new AppLogger(FaramoveAdapter.name);

  constructor(
    private faramoveData: FaramoveDataService,
    private httpService: HttpService,
    private geocodeService: GeocodeService,
    private rateLimiter: ProviderRateLimiterService,
  ) {
    super();
  }

  async getQuote(request: UnifiedQuoteRequest): Promise<ProviderQuote> {
  this.logger.logAdapter('faramove', 'getQuote called with request', request);

  // Log raw request and formatted payload together for interstate quotes
  // The payload is built below, so we log after payload assignment
    
    // Check rate limit before proceeding
    const isAllowed = await this.rateLimiter.checkRateLimit('faramove');
    if (!isAllowed) {
      const waitTime = this.rateLimiter.getTimeUntilReset('faramove');
      throw new Error(`Faramove rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    let pickupStateId, deliveryStateId, weightRangeId, dropOffCityId, pickupCoords, deliveryCoords;
    // Always normalize state names for cache lookup
    const pickupStateName = request.pickup.state?.trim().toLowerCase();
    const deliveryStateName = request.delivery.state?.trim().toLowerCase();
    
    // Check if we should use production data (either in production environment or explicitly enabled)
    const useProductionData = process.env.NODE_ENV === 'production' || process.env.FARAMOVE_USE_PRODUCTION_DATA === 'true';
    
    if (!useProductionData) {
      // Use Faramove test credentials and IDs
      pickupStateId = this.faramoveData.getCache('states')?.get(pickupStateName) || '632e1a67a44f438de79a7394';
      deliveryStateId = this.faramoveData.getCache('states')?.get(deliveryStateName) || '632e1a67a44f438de79a7394';
      weightRangeId = '6646005a41bceaaef1f57c84';
      dropOffCityId = '63bc2a4e18811d09f9a4193a';
      pickupCoords = [3.3494666, 6.578996999999999];
      deliveryCoords = [3.3581326999999996, 6.6143564];
    } else {
      pickupStateId = await this.faramoveData.getStateId(pickupStateName);
      deliveryStateId = await this.faramoveData.getStateId(deliveryStateName);
      weightRangeId = await this.faramoveData.getWeightRangeId(request.item.weight);
      dropOffCityId = await this.faramoveData.getCityId(pickupStateId, request.delivery.city);
      pickupCoords = request.pickup.coordinates;
      deliveryCoords = request.delivery.coordinates;
    }
      this.logger.logAdapter('faramove', 'Weight info', {
        requestedWeight: request.item.weight,
        resolvedWeightRangeId: weightRangeId
      });
    this.logger.logAdapter('faramove', 'State IDs resolved', { pickupStateId, deliveryStateId });
    const isIntracity = pickupStateId === deliveryStateId;
    let payload;
    if (isIntracity) {
        // Defensive checks and logging for pickupCoords and deliveryCoords
        this.logger.logAdapter('faramove', 'pickupCoords', pickupCoords);
        this.logger.logAdapter('faramove', 'deliveryCoords', deliveryCoords);
        if (!Array.isArray(pickupCoords) || pickupCoords.length < 2) {
          this.logger.logAdapter('faramove', 'Error: pickupCoords is invalid', pickupCoords);
          throw new Error('pickupCoords is undefined or does not have at least 2 elements');
        }
        if (!Array.isArray(deliveryCoords) || deliveryCoords.length < 2) {
          this.logger.logAdapter('faramove', 'Error: deliveryCoords is invalid', deliveryCoords);
          throw new Error('deliveryCoords is undefined or does not have at least 2 elements');
        }
      // Build addresses array for pickup and drop-offs (supporting only one drop-off for now)
      const addresses = [
        {
          type: "Point",
          coordinates: [pickupCoords[1], pickupCoords[0]] // [longitude, latitude]
        },
        {
          type: "Point",
          coordinates: [deliveryCoords[1], deliveryCoords[0]] // [longitude, latitude]
        }
      ];
      // Build packages array (single drop-off for now)
      const dropOffCityForPackage = dropOffCityId || (await this.faramoveData.getCityId(deliveryStateId, request.delivery.city));
      const packages = [
        {
          weight_range: weightRangeId,
          itemValue: request.item.value || 0,
          drop_off_city: dropOffCityForPackage,
          drop_off_position: 1
        }
      ];
      const businessId = '68ad8931276963d5228201c4';
      payload = {
        business: businessId,
        service_type: "INTRA-CITY & INTER-STATE SHIPMENTS",
        quote_type: "INTRA_CITY",
        addresses,
        pickup_state: pickupStateId,
        packages,
        additional_services: request.meta?.additionalServices || []
      };
    } else {
      payload = {
        service_type: "INTRA-CITY & INTER-STATE SHIPMENTS",
        quote_type: "INTER_STATE",
        packages: [
          {
            weight_range: weightRangeId,
            itemValue: request.item.value?.toString() || ""
          }
        ],
        pickup_state: pickupStateId,
        pick_up_type: "HOME_PICK_UP",
        delivery_type: "HOME_DELIVERY",
        dropoff_state: deliveryStateId,
        additional_services: request.meta?.additionalServices || []
      };
      // Log both raw request and formatted payload for interstate
      this.logger.logAdapter('faramove', 'Interstate quote request & payload', {
        rawRequest: request,
        formattedPayload: payload
      });
    }
  const apiKey = process.env.FARAMOVE_API_KEY;
  const baseUrl = process.env.FARAMOVE_BASE_URL || 'https://api.faramove.com';
  const endpoint = '/api/v2/quote/request-quote';
  const url = `${baseUrl}${endpoint}`;
  // Log the payload being sent to Faramove for quote
  this.logger.logAdapter('faramove', 'Quote request payload', payload);
    try {
      this.logger.logAdapter('faramove', 'Sending request', { url, payload });
      
      // Wait for rate limit before making request
      await this.rateLimiter.waitForRateLimit('faramove');
      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: { 'api-key': apiKey }
        })
      );
  // Log the full raw response from Faramove for debugging
  this.logger.logAdapter('faramove', 'Raw Faramove response', response.data);
      const data = response.data;
      this.logger.logAdapter('faramove', 'Received response', data);
      // Extract price for both intra- and intercity
      let price = 0;
      if (data?.data?.quotes && Array.isArray(data.data.quotes) && data.data.quotes.length > 0) {
        const quoteObj = data.data.quotes[0];
        price = quoteObj.total_quote_with_insurance || quoteObj.total_quote || quoteObj.quote || data.data.total_quote || 0;
      } else if (data?.data?.total_quote) {
        price = data.data.total_quote;
      }
      // Faramove test API does not return ETA, so set a default
      const eta = 'N/A';
      return {
        provider: 'Faramove',
        price,
        eta,
        serviceType: isIntracity ? 'INTRACITY' : 'INTERSTATE',
        meta: {
          weight_range: weightRangeId,
          insurance: data?.data?.quotes?.[0]?.insurance,
          discount: data?.data?.quotes?.[0]?.discount,
          vat: data?.data?.quotes?.[0]?.vat_percentage,
          additional_services: data?.data?.quotes?.[0]?.additional_services,
          raw: data?.data
        }
      };
    } catch (error) {
      console.error('FaramoveAdapter: Error in getQuote:', error?.response?.data || error.message);
      console.error('FaramoveAdapter: Full error:', error);
      throw new Error('Faramove quote failed: ' + (error?.response?.data?.message || error.message));
    }
  }

  async createOrder(quoteId: string, request: UnifiedQuoteRequest): Promise<OrderResponse> {
      // Log incoming createOrder request for debugging
      this.logger.logAdapter('faramove', 'createOrder incoming request', request);
    // Check rate limit before proceeding
    const isAllowed = await this.rateLimiter.checkRateLimit('faramove');
    if (!isAllowed) {
      const waitTime = this.rateLimiter.getTimeUntilReset('faramove');
      throw new Error(`Faramove rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    // Always geocode addresses and use mapped Faramove IDs
    let pickupGeocode, deliveryGeocode, pickupStateId, dropoffStateId, weightRangeId, pickupCityId, dropoffCityId, isIntracity;
    
    // Check if we should use production data (either in production environment or explicitly enabled)
    const useProductionData = process.env.NODE_ENV === 'production' || process.env.FARAMOVE_USE_PRODUCTION_DATA === 'true';
    
    if (!useProductionData) {
      // Use Faramove test credentials and IDs for dev
      pickupGeocode = { formattedAddress: 'Oshodi Main Market, 579 Oshodi pedestrian Overpass, Papa Ajao, Lagos 102215, Lagos, Nigeria', coordinates: [3.3510486, 6.555898600000001] };
      deliveryGeocode = { formattedAddress: 'Challenge Expressway, Oluyole, Ibadan 200114, Oyo, Nigeria', coordinates: [3.8780037, 7.3452289] };
      pickupStateId = '632e1a67a44f438de79a7394'; // Lagos
      dropoffStateId = '632e1a67a44f438de79a739a'; // Oyo
      weightRangeId = '6646005a41bceaaef1f57c84';
      pickupCityId = '63adba2db7fbca9116685349';
      dropoffCityId = '63adba2db7fbca9116685349';
      isIntracity = pickupStateId === dropoffStateId;
    } else {
      pickupGeocode = await this.geocodeService.getGeocodeData(request.pickup.address);
      deliveryGeocode = await this.geocodeService.getGeocodeData(request.delivery.address);
      pickupStateId = await this.faramoveData.getStateId(request.pickup.state);
      dropoffStateId = await this.faramoveData.getStateId(request.delivery.state);
      weightRangeId = await this.faramoveData.getWeightRangeId(request.item.weight);
      pickupCityId = await this.faramoveData.getCityId(pickupStateId, request.pickup.city);
      dropoffCityId = await this.faramoveData.getCityId(dropoffStateId, request.delivery.city);
      isIntracity = pickupStateId === dropoffStateId;
        // Fallback to request coordinates if geocoding fails
        if (!pickupGeocode?.coordinates || pickupGeocode.coordinates.length < 2) {
          this.logger.logAdapter('faramove', 'pickupGeocode missing or invalid, using request.pickup.coordinates', request.pickup.coordinates);
          pickupGeocode = {
            formattedAddress: request.pickup.address,
            coordinates: request.pickup.coordinates
          };
        }
        if (!deliveryGeocode?.coordinates || deliveryGeocode.coordinates.length < 2) {
          this.logger.logAdapter('faramove', 'deliveryGeocode missing or invalid, using request.delivery.coordinates', request.delivery.coordinates);
          deliveryGeocode = {
            formattedAddress: request.delivery.address,
            coordinates: request.delivery.coordinates
          };
        }
    }
      // Log test pickup/delivery geocode
      this.logger.logAdapter('faramove', 'pickupGeocode (test)', pickupGeocode);
      this.logger.logAdapter('faramove', 'deliveryGeocode (test)', deliveryGeocode);
      // Log geocode results before fallback
      this.logger.logAdapter('faramove', 'pickupGeocode (prod)', pickupGeocode);
      this.logger.logAdapter('faramove', 'deliveryGeocode (prod)', deliveryGeocode);
      // Log geocode results after fallback
      this.logger.logAdapter('faramove', 'pickupGeocode (final)', pickupGeocode);
      this.logger.logAdapter('faramove', 'deliveryGeocode (final)', deliveryGeocode);
    const payload: any = {
      service: "SHIP WITHIN NIGERIA",
      service_type: "INTRA-CITY & INTER-STATE SHIPMENTS",
      pickup: {
        date: new Date().toISOString(),
        contact_name: request.pickup.contactName || request.pickup.city,
        phone_number: request.pickup.contactPhone,
        address: pickupGeocode?.formattedAddress || request.pickup.address,
        location: {
          type: "Point",
          coordinates: (pickupGeocode?.coordinates || request.pickup.coordinates).length === 2
            ? [
                (pickupGeocode?.coordinates || request.pickup.coordinates)[1],
                (pickupGeocode?.coordinates || request.pickup.coordinates)[0]
              ]
            : (pickupGeocode?.coordinates || request.pickup.coordinates)
        },
        city: pickupCityId,
        state: pickupStateId,
        pick_up_type: "HOME_PICK_UP"
      },
      destination: [
        {
          contact_name: request.delivery.customerName,
          phone_number: request.delivery.customerPhone,
          address: deliveryGeocode?.formattedAddress || request.delivery.address,
          location: {
            type: "Point",
            coordinates: (deliveryGeocode?.coordinates || request.delivery.coordinates).length === 2
              ? [
                  (deliveryGeocode?.coordinates || request.delivery.coordinates)[1],
                  (deliveryGeocode?.coordinates || request.delivery.coordinates)[0]
                ]
              : (deliveryGeocode?.coordinates || request.delivery.coordinates)
          },
          city: dropoffCityId,
          state: dropoffStateId,
          delivery_type: "HOME_DELIVERY",
          description: request.item.description || '',
          packages: [
            {
              weight: weightRangeId,
              weight_type: "KG",
              item_value: request.item.value || 0
            }
          ]
        }
      ],
      description: request.item.description || '',
      delivery_method_type: "Express",
      additional_services: [],
      booking_type: isIntracity ? "INTRACITY" : "INTERSTATE",
      quote: request.meta?.quote
    };
      // Log the payload being sent to Faramove for createOrder
      this.logger.logAdapter('faramove', 'createOrder payload', payload);
    const apiUrl = process.env.FARAMOVE_BASE_URL || 'https://api.faramove.com';
    const apiKey = process.env.FARAMOVE_API_KEY;
    const url = `${apiUrl}/api/v2/booking/partner`;
    // Wait for rate limit before order creation request
    await this.rateLimiter.waitForRateLimit('faramove');
    const response = await firstValueFrom(
      this.httpService.post(url, payload, {
        headers: { 'api-key': apiKey }
      })
    );
    // Log the full Faramove response body for debugging
    this.logger.logAdapter('faramove', 'createOrder response', response.data);
    const data = response.data.data;
    return {
      provider: 'Faramove',
      orderId: data?.id || data?._id,
      trackingNumber: data?.tracking_number || "",
      status: data?.status || "CREATED"
    };
  }

  async trackOrder(orderId: string): Promise<TrackingStatus> {
    // Check rate limit before proceeding
    const isAllowed = await this.rateLimiter.checkRateLimit('faramove');
    if (!isAllowed) {
      const waitTime = this.rateLimiter.getTimeUntilReset('faramove');
      throw new Error(`Faramove rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    const apiUrl = process.env.FARAMOVE_BASE_URL || 'https://api.faramove.com';
    const apiKey = process.env.FARAMOVE_API_KEY;
    const url = `${apiUrl}/api/v2/shipment/shipment-status/${orderId}`;
    // const url = `${apiUrl}/api/v2/shipment/shipment-status/67cfea68c23569371f26e0eb`;
    
    // Wait for rate limit before tracking request
    await this.rateLimiter.waitForRateLimit('faramove');
    const response = await firstValueFrom(
      this.httpService.get(url, {
        headers: { 'api-key': apiKey }
      })
    );
    const data = response.data.data;

    // Helper to get the latest event from a status group
    const getLastEvent = (group) => Array.isArray(data[group]) && data[group].length > 0 ? data[group][data[group].length - 1] : null;

    // Priority: COMPLETED > CANCELED > CURRENT > fallback
    let latestEvent = getLastEvent('COMPLETED')
      || getLastEvent('CANCELED')
      || getLastEvent('CURRENT');

    // Fallback: search all groups for the most recent event
    if (!latestEvent) {
      let allEvents = [];
      Object.values(data).forEach(arr => {
        if (Array.isArray(arr)) allEvents = allEvents.concat(arr);
      });
      if (allEvents.length > 0) {
        // Sort by updatedAt or createdAt
        allEvents.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
        latestEvent = allEvents[0];
      }
    }

    const status = latestEvent?.name || 'Unknown';
    const updatedAt = latestEvent?.updatedAt || latestEvent?.createdAt || new Date().toISOString();

    const trackingData = {
      status,
      updatedAt,
      meta: data
    };
    this.logger.logAdapter('faramove', 'trackOrder response', trackingData);
    return trackingData;
  }

  async cancelOrder(orderId: string): Promise<void> {
      throw new Error('Faramove cancellation not implemented or not supported by API.');
    }
  }
