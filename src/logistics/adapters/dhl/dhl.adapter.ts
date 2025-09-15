import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LogisticsProviderAdapter } from '../index';
import { UnifiedQuoteRequest, ProviderQuote, OrderResponse, TrackingStatus } from '../../types';
import { GeocodeService } from '../../../utils/geocode.service';
import { ProviderRateLimiterService } from '../../../utils/provider-rate-limiter.service';

@Injectable()
export class DhlAdapter extends LogisticsProviderAdapter {

  private dhlClientId = process.env.DHL_CLIENT_ID;
  private dhlClientSecret = process.env.DHL_CLIENT_SECRET;
  private dhlBaseUrl = process.env.NODE_ENV === 'production'
    ? (process.env.DHL_PRODUCTION_URL || 'https://express.api.dhl.com/mydhlapi')
    : (process.env.DHL_BASE_URL || 'https://express.api.dhl.com/mydhlapi/test');


  constructor(
    private httpService: HttpService,
    private geocodeService: GeocodeService,
    private rateLimiter: ProviderRateLimiterService,
  ) {
    super();
  }


  // Methods to be implemented: getQuote, createOrder, trackOrder, cancelOrder
  async getQuote(request: UnifiedQuoteRequest): Promise<ProviderQuote> {
    // Check rate limit before proceeding
    const isAllowed = await this.rateLimiter.checkRateLimit('dhl');
    if (!isAllowed) {
      const waitTime = this.rateLimiter.getTimeUntilReset('dhl');
      throw new Error(`DHL rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    // Prepare Basic Auth header
    const clientId = this.dhlClientId;
    const clientSecret = this.dhlClientSecret?.replace(/^'|'$/g, ''); // Remove quotes if present
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    // Map request to DHL query params (update as needed for your data)
    const accountNumber = process.env.DHL_ACCOUNT_NUMBER;
    const originCountryCode = request.pickup.countryCode;
    const originCityName = request.pickup.city;
    const destinationCountryCode = request.delivery.countryCode;
    const destinationCityName = request.delivery.city;
    const weight = request.item.weight;
    const length = request.item.length ?? 10;
    const width = request.item.width ?? 10;
    const height = request.item.height ?? 10;
    const plannedShippingDate = new Date(Date.now() + 3600 * 1000).toISOString().split('T')[0];
    const unitOfMeasurement = 'metric';

    // Determine if shipment is international
    const pickupCountry = request.pickup.countryName?.trim().toLowerCase();
    const deliveryCountry = request.delivery.countryName?.trim().toLowerCase();
    const isInternational = pickupCountry && deliveryCountry && pickupCountry !== deliveryCountry;
    const isCustomsDeclarable = isInternational;
    // Use productCode: N for local, P for international (non-document)
    const productCode = isInternational ? 'P' : 'N';

    // Build query string
    const params = new URLSearchParams({
      accountNumber,
      originCountryCode,
      originCityName,
      destinationCountryCode,
      destinationCityName,
      weight: weight.toString(),
      length: length.toString(),
      width: width.toString(),
      height: height.toString(),
      plannedShippingDate,
      isCustomsDeclarable: isCustomsDeclarable.toString(),
      unitOfMeasurement,
      productCode,
    });

    const url = `${this.dhlBaseUrl}/rates?${params.toString()}`;

    // Wait for rate limit before making request
    await this.rateLimiter.waitForRateLimit('dhl');

    try {
      const resp = await firstValueFrom(this.httpService.get(url, {
        headers: {
          Authorization: `Basic ${basicAuth}`,
        },
      }));
      const data = resp.data;
      // Log the full products array for debugging
      // console.log('DHL products:', JSON.stringify(data.products, null, 2));

      // Select product based on shipment type
      let selectedProduct;
      if (isInternational) {
        // For international, look for productCode 'P' and valid price
        selectedProduct = Array.isArray(data.products)
          ? data.products.find((p: any) =>
            p.productCode === 'P' &&
            Array.isArray(p.totalPrice) &&
            p.totalPrice.some((tp: any) => tp.priceCurrency === 'NGN' && tp.price > 0)
          )
          : undefined;
        if (!selectedProduct) {
          throw new Error('No valid DHL EXPRESS INTERNATIONAL quote available');
        }
      } else {
        // For local, look for productCode 'N' and valid price
        selectedProduct = Array.isArray(data.products)
          ? data.products.find((p: any) =>
            p.productCode === 'N' &&
            Array.isArray(p.totalPrice) &&
            p.totalPrice.some((tp: any) => tp.priceCurrency === 'NGN' && tp.price > 0)
          )
          : undefined;
        if (!selectedProduct) {
          throw new Error('No valid DHL EXPRESS DOMESTIC quote available');
        }
      }

      const ngnPrice = selectedProduct.totalPrice.find((tp: any) => tp.priceCurrency === 'NGN')?.price || 0;
      let eta = '2-5 days';
      const etaIso = selectedProduct.deliveryCapabilities?.estimatedDeliveryDateAndTime;
      if (etaIso) {
        const now = new Date();
        const etaDate = new Date(etaIso);
        const diffMs = etaDate.getTime() - now.getTime();
        let diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays < 1) diffDays = 1;
        eta = diffDays === 1 ? '1 day' : `${diffDays} days`;
      }

      return {
        provider: 'dhl',
        price: ngnPrice,
        eta,
        serviceType: selectedProduct.productName || 'standard',
        meta: {
          productCode: selectedProduct.productCode,
          // products: data.products,
          // exchangeRates: data.exchangeRates,
          priceCurrency: 'NGN',
        },
      };
    } catch (error) {
      console.error('DhlAdapter: Error in getQuote:', error?.response?.data || error.message);
      throw new Error('DHL getQuote failed: ' + (error?.response?.data?.detail || error.message));
    }
  }


  async createOrder(quoteId: string, request: UnifiedQuoteRequest): Promise<OrderResponse> {
    // Check rate limit before proceeding
    const isAllowed = await this.rateLimiter.checkRateLimit('dhl');
    if (!isAllowed) {
      const waitTime = this.rateLimiter.getTimeUntilReset('dhl');
      throw new Error(`DHL rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    const url = `${this.dhlBaseUrl}/shipments`;
    // Build Basic Auth header
    const basicAuth = Buffer.from(`${this.dhlClientId}:${this.dhlClientSecret}`).toString('base64');
    // Geocode pickup and delivery addresses
    const pickupGeocode = await this.geocodeService.getGeocodeData(request.pickup.address);
    const deliveryGeocode = await this.geocodeService.getGeocodeData(request.delivery.address);

    // Log addressLine1 and coordinates for pickup and delivery
    const pickupAddressLine1 = (pickupGeocode?.formattedAddress || request.pickup.address).slice(0, 45);
    const deliveryAddressLine1 = (deliveryGeocode?.formattedAddress || request.delivery.address).slice(0, 45);
    console.log('DHL Pickup addressLine1:', pickupAddressLine1);
    console.log('DHL Pickup coordinates:', pickupGeocode?.coordinates);
    console.log('DHL Delivery addressLine1:', deliveryAddressLine1);
    console.log('DHL Delivery coordinates:', deliveryGeocode?.coordinates);

    // Format date as 'YYYY-MM-DDTHH:mm:ss GMT+01:00'
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = now.getFullYear();
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const min = pad(now.getMinutes());
    const ss = pad(now.getSeconds());
    // Use +01:00 as default offset, or calculate from local time if needed
    const gmtOffset = '+01:00';
    const plannedShippingDateAndTime = `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss} GMT${gmtOffset}`;

    // Debug: log meta and productCode
    // console.log('DHL createOrder request.meta:', request.meta);
    // Determine if shipment is international
    const pickupCountry = request.pickup.countryName?.trim().toLowerCase();
    const deliveryCountry = request.delivery.countryName?.trim().toLowerCase();
    const isInternational = pickupCountry && deliveryCountry && pickupCountry !== deliveryCountry;
    // Determine if shipment is document or non-document
    const isDocument = request.item.isDocument === true;

    let productCode = 'N';
    // DHL product code logic based on onboarding table
    if (isInternational) {
      productCode = isDocument ? 'D' : 'P';
    } else {
      productCode = isDocument ? 'N' : 'N'; // For local, both are 'N' per table
    }
    // If meta.productCode is set, override
    if (request.meta?.productCode) {
      productCode = request.meta.productCode;
    }
    console.log('DHL createOrder productCode:', productCode);

    // Extract postal codes from geocoded data (Google already validates these)
    const pickupPostalCode = pickupGeocode?.postalCode ||
      request.pickup.postalCode ||
      process.env.DHL_SHIPPER_POSTAL ||
      '00000';
    const deliveryPostalCode = deliveryGeocode?.postalCode ||
      request.delivery.postalCode ||
      process.env.DHL_RECEIVER_POSTAL ||
      '00000';

    console.log(`DHL Postal Codes - Pickup: ${pickupPostalCode} (from geocoding: ${pickupGeocode?.postalCode}), Delivery: ${deliveryPostalCode} (from geocoding: ${deliveryGeocode?.postalCode})`);

    // Detect domestic shipment within Nigeria
    const isDomesticNG =
      request.pickup.countryCode === 'NG' &&
      request.delivery.countryCode === 'NG' &&
      request.pickup.countryName?.trim().toLowerCase() === 'nigeria' &&
      request.delivery.countryName?.trim().toLowerCase() === 'nigeria';

    let payload;
    if (isDomesticNG) {
      payload = {
        plannedShippingDateAndTime,
        productCode: 'N',
        pickup: {
          isRequested: false,
        },
        outputImageProperties: {
          allDocumentsInOneImage: true,
          encodingFormat: 'pdf',
          imageOptions: [
            {
              templateName: 'ECOM26_84_A4_001',
              typeCode: 'label',
            },
            {
              templateName: 'ARCH_8X4_A4_002',
              isRequested: true,
              typeCode: 'waybillDoc',
              hideAccountNumber: true,
            },
          ],
        },
        accounts: [
          {
            number: process.env.DHL_ACCOUNT_NUMBER || '123456789',
            typeCode: 'shipper',
          },
        ],
        customerDetails: {
          shipperDetails: {
            postalAddress: {
              addressLine1: pickupAddressLine1,
              // addressLine2, addressLine3, countyName omitted
              postalCode: pickupPostalCode,
              cityName: request.pickup.city,
              countryCode: request.pickup.countryCode,
            },
            contactInformation: {
              fullName: request.pickup.contactName || 'Sender',
              companyName: process.env.DHL_SHIPPER_COMPANY || 'Sender Company',
              email: process.env.DHL_SHIPPER_EMAIL || 'sender@example.com',
              phone: request.pickup.contactPhone,
            },
            typeCode: 'business',
          },
          receiverDetails: {
            postalAddress: {
              addressLine1: deliveryAddressLine1,
              // addressLine2, addressLine3, countyName omitted
              postalCode: deliveryPostalCode,
              cityName: request.delivery.city,
              countryCode: request.delivery.countryCode,
            },
            contactInformation: {
              fullName: request.delivery.customerName,
              companyName: process.env.DHL_RECEIVER_COMPANY || 'Receiver Company',
              email: process.env.DHL_RECEIVER_EMAIL || 'receiver@example.com',
              phone: request.delivery.customerPhone,
            },
            typeCode: 'business',
          },
        },
        content: {
          packages: [
            {
              weight: request.item.weight,
              dimensions: {
                length: request.item.length ?? 10,
                width: request.item.width ?? 10,
                height: request.item.height ?? 10,
              },
            },
          ],
          isCustomsDeclarable: false,
          description: request.item.description,
          incoterm: 'DAP',
          unitOfMeasurement: 'metric',
        },
      };
    } else {
      // International shipments - check if it's documents or packages
      const isDocument = request.item.isDocument === true;
      
      if (isDocument) {
        // International Document shipment (productCode: D)
        payload = {
          plannedShippingDateAndTime,
          productCode: 'D',
          accounts: [
            {
              number: process.env.DHL_ACCOUNT_NUMBER || '123456789',
              typeCode: 'shipper',
            },
          ],
          pickup: {
            isRequested: false,
          },
          outputImageProperties: {
            allDocumentsInOneImage: true,
            encodingFormat: 'pdf',
            imageOptions: [
              {
                templateName: 'ECOM26_84_A4_001',
                typeCode: 'label',
              },
              {
                templateName: 'ARCH_8X4_A4_002',
                isRequested: true,
                hideAccountNumber: true,
                typeCode: 'waybillDoc',
              },
              {
                templateName: 'COMMERCIAL_INVOICE_P_10',
                invoiceType: 'commercial',
                languageCode: 'eng',
                isRequested: true,
                typeCode: 'invoice',
              },
            ],
          },
          customerDetails: {
            shipperDetails: {
              postalAddress: {
                addressLine1: pickupAddressLine1,
                postalCode: pickupPostalCode,
                cityName: request.pickup.city,
                countryCode: request.pickup.countryCode,
              },
              contactInformation: {
                fullName: request.pickup.contactName || 'Sender',
                companyName: process.env.DHL_SHIPPER_COMPANY || 'Sender Company',
                email: process.env.DHL_SHIPPER_EMAIL || 'sender@example.com',
                phone: request.pickup.contactPhone,
              },
              typeCode: 'business',
            },
            receiverDetails: {
              postalAddress: {
                addressLine1: deliveryAddressLine1,
                postalCode: deliveryPostalCode,
                cityName: request.delivery.city,
                countryCode: request.delivery.countryCode,
              },
              contactInformation: {
                fullName: request.delivery.customerName,
                companyName: process.env.DHL_RECEIVER_COMPANY || 'Receiver Company',
                email: process.env.DHL_RECEIVER_EMAIL || 'receiver@example.com',
                phone: request.delivery.customerPhone,
              },
              typeCode: 'business',
            },
          },
          content: {
            packages: [
              {
                weight: request.item.weight,
                dimensions: {
                  length: request.item.length ?? 30,
                  width: request.item.width ?? 10,
                  height: request.item.height ?? 10,
                },
              },
            ],
            exportDeclaration: {
              lineItems: [
                {
                  number: 1,
                  quantity: {
                    unitOfMeasurement: 'PCS',
                    value: 1,
                  },
                  price: request.item.value || 15000,
                  description: request.item.description,
                  weight: {
                    netValue: request.item.weight,
                    grossValue: request.item.weight,
                  },
                  commodityCodes: [
                    {
                      typeCode: 'outbound',
                      value: '123456.78.90', // Default HS code for documents
                    },
                    {
                      typeCode: 'inbound',
                      value: '123456.78.90', // Default HS code for documents
                    },
                  ],
                  exportReasonType: 'permanent',
                  manufacturerCountry: request.pickup.countryCode || 'NG',
                },
              ],
              exportReason: 'Permanent',
              invoice: {
                number: quoteId,
                date: new Date().toISOString().split('T')[0],
              },
              placeOfIncoterm: request.delivery.city,
              exportReasonType: 'permanent',
              shipmentType: 'personal',
            },
            unitOfMeasurement: 'metric',
            isCustomsDeclarable: false,
            incoterm: 'DAP',
            description: request.item.description,
            declaredValueCurrency: process.env.DHL_CURRENCY || 'NGN',
            declaredValue: request.item.value || 15000,
          },
          customerReferences: [
            {
              value: quoteId,
              typeCode: 'CU',
            },
          ],
        };
      } else {
        // International Package shipment (productCode: P)
        payload = {
          plannedShippingDateAndTime,
          productCode: 'P',
          accounts: [
            {
              number: process.env.DHL_ACCOUNT_NUMBER || '123456789',
              typeCode: 'shipper',
            },
          ],
          pickup: {
            isRequested: false,
          },
          outputImageProperties: {
            allDocumentsInOneImage: true,
            encodingFormat: 'pdf',
            imageOptions: [
              {
                templateName: 'ECOM26_84_A4_001',
                typeCode: 'label',
              },
              {
                templateName: 'ARCH_8X4_A4_002',
                isRequested: true,
                hideAccountNumber: true,
                typeCode: 'waybillDoc',
              },
              {
                templateName: 'COMMERCIAL_INVOICE_P_10',
                invoiceType: 'commercial',
                languageCode: 'eng',
                isRequested: true,
                typeCode: 'invoice',
              },
            ],
          },
          customerDetails: {
            shipperDetails: {
              postalAddress: {
                addressLine1: pickupAddressLine1,
                postalCode: pickupPostalCode,
                cityName: request.pickup.city,
                countryCode: request.pickup.countryCode,
              },
              contactInformation: {
                fullName: request.pickup.contactName || 'Sender',
                companyName: process.env.DHL_SHIPPER_COMPANY || 'Sender Company',
                email: process.env.DHL_SHIPPER_EMAIL || 'sender@example.com',
                phone: request.pickup.contactPhone,
              },
              typeCode: 'business',
            },
            receiverDetails: {
              postalAddress: {
                addressLine1: deliveryAddressLine1,
                postalCode: deliveryPostalCode,
                cityName: request.delivery.city,
                countryCode: request.delivery.countryCode,
              },
              contactInformation: {
                fullName: request.delivery.customerName,
                companyName: process.env.DHL_RECEIVER_COMPANY || 'Receiver Company',
                email: process.env.DHL_RECEIVER_EMAIL || 'receiver@example.com',
                phone: request.delivery.customerPhone,
              },
              typeCode: 'business',
            },
          },
          content: {
            packages: [
              {
                weight: request.item.weight,
                dimensions: {
                  length: request.item.length ?? 30,
                  width: request.item.width ?? 30,
                  height: request.item.height ?? 30,
                },
              },
            ],
            exportDeclaration: {
              lineItems: [
                {
                  number: 1,
                  quantity: {
                    unitOfMeasurement: 'PCS',
                    value: 1,
                  },
                  price: request.item.value || 100000,
                  description: request.item.description,
                  weight: {
                    netValue: request.item.weight,
                    grossValue: request.item.weight,
                  },
                  commodityCodes: [
                    {
                      typeCode: 'inbound',
                      value: '85171300', // Default HS code for packages
                    },
                    {
                      typeCode: 'outbound',
                      value: '85171300', // Default HS code for packages
                    },
                  ],
                  exportReasonType: 'permanent',
                  manufacturerCountry: request.pickup.countryCode || 'NG',
                },
              ],
              exportReason: 'Permanent',
              additionalCharges: [
                {
                  value: 259760.96, // Default freight cost - should be calculated from rates API
                  typeCode: 'freight',
                },
              ],
              invoice: {
                number: quoteId,
                date: new Date().toISOString().split('T')[0],
              },
              placeOfIncoterm: request.delivery.city,
              exportReasonType: 'permanent',
              shipmentType: 'commercial',
            },
            unitOfMeasurement: 'metric',
            isCustomsDeclarable: true,
            incoterm: 'DAP',
            description: request.item.description,
            declaredValueCurrency: process.env.DHL_CURRENCY || 'NGN',
            declaredValue: request.item.value || 200000,
          },
          valueAddedServices: request.meta?.insurance ? [
            {
              serviceCode: 'II',
              value: 20000, // Default insurance value
              currency: process.env.DHL_CURRENCY || 'NGN',
            },
          ] : undefined,
          customerReferences: [
            {
              value: quoteId,
              typeCode: 'CU',
            },
          ],
        };
      }
    }

    // Wait for rate limit before making request
    await this.rateLimiter.waitForRateLimit('dhl');

  // Log the payload sent to DHL for debugging
  // console.log('DHL createOrder payload:', JSON.stringify(payload, null, 2));
  try {
      const resp = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        })
      );
      const data = resp.data;
        // Log the original DHL response for debugging
        // console.log('DHL createOrder original response:', JSON.stringify(data, null, 2));
        // Extract base64 PDF label from DHL response
        let pdfLabel: string | null = null;
        if (data.documents && Array.isArray(data.documents)) {
          const labelDoc = data.documents.find((doc: any) => doc.typeCode === 'label' && doc.content);
          if (labelDoc) {
            pdfLabel = labelDoc.content;
          }
        }
        return {
          provider: 'dhl',
          orderId: data.shipmentTrackingNumber || data.id || '',
          trackingNumber: data.shipmentTrackingNumber || '',
          status: data.status || 'Created',
          pdfLabel,
        };
    } catch (error) {
      if (error?.response) {
        console.error('DhlAdapter: Error in createOrder:', error.response.status, error.response.data);
      } else {
        console.error('DhlAdapter: Error in createOrder:', error.message);
      }
      throw new Error('DHL createOrder failed: ' + (error?.response?.data?.detail || error.message));
    }
  }

  async trackOrder(orderId: string): Promise<TrackingStatus> {
    // Check rate limit before proceeding
    const isAllowed = await this.rateLimiter.checkRateLimit('dhl');
    if (!isAllowed) {
      const waitTime = this.rateLimiter.getTimeUntilReset('dhl');
      throw new Error(`DHL rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    // DHL tracking API: /track/shipments?trackingNumber=...
    const trackingNumber = orderId;
    const url = `${this.dhlBaseUrl}/shipments/${trackingNumber}/tracking`;
    const basicAuth = Buffer.from(`${this.dhlClientId}:${this.dhlClientSecret}`).toString('base64');

    // Wait for rate limit before making request
    await this.rateLimiter.waitForRateLimit('dhl');

    try {
      const resp = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            Authorization: `Basic ${basicAuth}`,
            Accept: 'application/json',
          },
        })
      );
      const data = resp.data;
      // DHL returns an array of shipments
      const shipment = Array.isArray(data.shipments) ? data.shipments[0] : data.shipments;
      if (!shipment) {
        throw new Error('No tracking data found for this order');
      }
      // Find the most recent event by date and time
      let latestEventDesc = '';
      let latestEventDateTime = '';
      if (shipment.events && Array.isArray(shipment.events) && shipment.events.length > 0) {
        const sortedEvents = shipment.events.slice().sort((a, b) => {
          const aDate = new Date(`${a.date}T${a.time}`);
          const bDate = new Date(`${b.date}T${b.time}`);
          return bDate.getTime() - aDate.getTime();
        });
        const latest = sortedEvents[0];
        latestEventDesc = latest.description || '';
        latestEventDateTime = `${latest.date}T${latest.time}`;
      }
      const trackingData = {
        status: latestEventDesc,
        statusDescription: latestEventDesc,
        updatedAt: latestEventDateTime,
        meta: data,
      };
      console.log('[DhlAdapter] Most recent event description:', latestEventDesc, 'at', latestEventDateTime);
      return trackingData;
    } catch (error) {
      if (error?.response) {
        console.error('DhlAdapter: Error in trackOrder:', error.response.status, error.response.data);
      } else {
        console.error('DhlAdapter: Error in trackOrder:', error.message);
      }
      throw new Error('DHL trackOrder failed: ' + (error?.response?.data?.detail || error.message));
    }
  }

  async cancelOrder(orderId: string): Promise<void> {
    // Check rate limit before proceeding
    const isAllowed = await this.rateLimiter.checkRateLimit('dhl');
    if (!isAllowed) {
      const waitTime = this.rateLimiter.getTimeUntilReset('dhl');
      throw new Error(`DHL rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    // DHL Cancel Shipment API
    const url = `${this.dhlBaseUrl}/shipments/${orderId}`;
    const basicAuth = Buffer.from(`${this.dhlClientId}:${this.dhlClientSecret}`).toString('base64');

    // Wait for rate limit before making request
    await this.rateLimiter.waitForRateLimit('dhl');

    try {
      await firstValueFrom(
        this.httpService.delete(url, {
          headers: {
            Authorization: `Basic ${basicAuth}`,
            Accept: 'application/json',
          },
        })
      );
    } catch (error) {
      if (error?.response) {
        console.error('DhlAdapter: Error in cancelOrder:', error.response.status, error.response.data);
      } else {
        console.error('DhlAdapter: Error in cancelOrder:', error.message);
      }
      throw new Error('DHL cancelOrder failed: ' + (error?.response?.data?.detail || error.message));
    }
  }
}
