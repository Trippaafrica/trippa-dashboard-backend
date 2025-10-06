import { Injectable } from '@nestjs/common';
import { UnifiedQuoteRequest, ProviderQuote } from './types';
import { FaramoveAdapter } from './adapters/faramove.adapter';
import { FezAdapter } from './adapters/fez.adapter';
import { GlovoAdapter } from './adapters/glovo.adapter';
import { GigAdapter } from './adapters/gig.adapter';
import { MARKUP_FEE } from './constants';
import { DhlAdapter } from './adapters/dhl/dhl.adapter';
import { getActiveLogisticsPartners } from './active-partners.util';
import { AppLogger } from '../utils/logger.service';
import { GlovoAddressBookService } from './adapters/glovo.addressbook';

@Injectable()
export class LogisticsAggregatorService {
  private readonly logger = new AppLogger(LogisticsAggregatorService.name);

  constructor(
    private faramove: FaramoveAdapter,
    private fez: FezAdapter,
    private glovo: GlovoAdapter,
    private gig: GigAdapter,
    private dhl: DhlAdapter,
    private glovoAddressBookService: GlovoAddressBookService,
  ) {}

  async getQuotes(request: UnifiedQuoteRequest, walletBalance?: number): Promise<ProviderQuote[]> {
    this.logger.logAggregator('Starting getQuotes for all providers');
    // Only call Glovo if both pickup and delivery states are 'lagos'
    const pickupState = request.pickup.state?.trim().toLowerCase();
    const deliveryState = request.delivery.state?.trim().toLowerCase();

    // Compute a reusable global Glovo addressBookId for pickup if Glovo is a candidate
    let glovoAddressBookId: string | undefined = undefined;
    let geocodedDelivery: { formattedAddress?: string, coordinates?: [number, number] } = {};
    if (pickupState === 'lagos' && deliveryState === 'lagos') {
      try {
        if (request.pickup?.address) {
          glovoAddressBookId = await this.glovoAddressBookService.getOrCreateGlobalAddressBookId(request.pickup.address);
          this.logger.logAggregator('Using global Glovo addressBookId', { glovoAddressBookId });
        } else {
          this.logger.warn('No pickup address provided; Glovo may fallback to raw pickup if supported');
        }
      } catch (err) {
        this.logger.error('Failed to get/create global Glovo address book ID', err);
      }
      // Geocode delivery address for Glovo
      try {
        const { getGeocodeData } = await import('../utils/geocode.util');
        const geo = await getGeocodeData(request.delivery.address);
        if (geo) {
          geocodedDelivery.formattedAddress = geo.formattedAddress;
          geocodedDelivery.coordinates = geo.coordinates;
          this.logger.logAggregator('Geocoded delivery address for Glovo', geocodedDelivery);
        } else {
          this.logger.warn(`Could not geocode delivery address: ${request.delivery.address}`);
        }
      } catch (err) {
        this.logger.error('Error geocoding delivery address for Glovo', err);
      }
    }

    // Only call DHL for international shipments (pickup and delivery country names differ)
    const activePartners = await getActiveLogisticsPartners();
    const providers = [];
    const pickupCountry = request.pickup.countryName?.trim().toLowerCase();
    const deliveryCountry = request.delivery.countryName?.trim().toLowerCase();
    if (pickupCountry && deliveryCountry && pickupCountry !== deliveryCountry) {
      // International shipment: Only DHL
      if (activePartners.includes('dhl')) {
        providers.push({ name: 'DHL', fn: this.dhl.getQuote.bind(this.dhl) });
      }
    } else {
      // Domestic shipment: All other providers as before
      if (activePartners.includes('faramove')) {
        providers.push({ name: 'Faramove', fn: this.faramove.getQuote.bind(this.faramove) });
      }
      if (activePartners.includes('fez')) {
        providers.push({ name: 'Fez', fn: this.fez.getQuote.bind(this.fez) });
      }
      if (pickupState === 'lagos' && deliveryState === 'lagos' && activePartners.includes('glovo')) {
        providers.push({
          name: 'Glovo',
          fn: (req: any) => {
            const meta = { ...req.meta, glovoAddressBookId };
            const delivery = {
              ...req.delivery,
              formattedAddress: geocodedDelivery.formattedAddress || req.delivery.address,
              coordinates: geocodedDelivery.coordinates || req.delivery.coordinates,
            };
            return this.glovo.getQuote({ ...req, meta, delivery });
          }
        });
      }
      if (activePartners.includes('gig')) {
        providers.push({ name: 'Gig', fn: this.gig.getQuote.bind(this.gig) });
      }
      // Optionally, include DHL for domestic if needed
      if (activePartners.includes('dhl')) {
        providers.push({ name: 'DHL', fn: this.dhl.getQuote.bind(this.dhl) });
      }
    }
    const results = await Promise.allSettled(
      providers.map(async (provider) => {
        try {
          this.logger.logAggregator(`Requesting quote from ${provider.name}`);
          this.logger.logAggregator(`Request object for ${provider.name}:`, JSON.stringify(request));
          const quote = await provider.fn(request);
          this.logger.logAggregator(`${provider.name} quote result`, quote);
          // Use 15% markup for DHL, else flat MARKUP_FEE
          let markup = MARKUP_FEE;
          if (provider.name.toLowerCase() === 'dhl') {
            markup = Math.round((quote.price || 0) * 0.15);
          }
          
          // Generate standardized partnerId based on partner name
          const partnerId = await this.generateProviderId(provider.name, quote);
          
          return {
            ...quote,
            partner: provider.name.toLowerCase(), // Standardize partner name (new unified field)
            // Remove the old 'provider' field to avoid confusion
            provider: undefined,
            partnerId, // Add unified partnerId
            price: (quote.price || 0) + markup, // Final price only
            // Standardize and simplify response structure
            currency: 'NGN',
            estimatedDeliveryTime: this.standardizeETA(quote.eta),
            serviceLevel: this.standardizeServiceLevel(quote.serviceType, provider.name),
            // Keep only essential meta data for order creation
            meta: this.extractEssentialMeta(quote.meta, provider.name)
          };
        } catch (err) {
          this.logger.error(`Error from ${provider.name}`, err?.message || err);
          throw err;
        }
      })
    );
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    this.logger.logAggregator(`Fulfilled quotes: ${fulfilled.length}, Rejected: ${rejected.length}`);
    if (rejected.length > 0) {
      rejected.forEach((r, i) => {
        this.logger.error(`Provider ${providers[i].name} failed`, (r as PromiseRejectedResult).reason);
      });
    }
    // Filter out partners whose price exceeds wallet balance
    let filteredQuotes = fulfilled.map(r => (r as PromiseFulfilledResult<ProviderQuote>).value);
    if (typeof walletBalance === 'number') {
      // walletBalance is in kobo, quote.price is in naira
      const walletBalanceNaira = walletBalance / 100;
      filteredQuotes = filteredQuotes.filter(q => Number(q.price) <= walletBalanceNaira);
    }
    return filteredQuotes;
  }

  /**
   * Get raw quotes for internal order processing (without public API modifications)
   * This is used by createOrder to get original provider pricing for calculations
   */
  async getRawQuotesForOrdering(request: UnifiedQuoteRequest): Promise<any[]> {
    this.logger.logAggregator('Getting raw quotes for order processing');
    
    // Similar logic to getQuotes but return raw provider responses
    const pickupState = request.pickup.state?.trim().toLowerCase();
    const deliveryState = request.delivery.state?.trim().toLowerCase();

    let glovoAddressBookId: string | undefined = undefined;
    let geocodedDelivery: { formattedAddress?: string, coordinates?: [number, number] } = {};
    
    if (pickupState === 'lagos' && deliveryState === 'lagos') {
      // Use global reusable address book ID keyed by pickup address
      try {
        if (request.pickup?.address) {
          glovoAddressBookId = await this.glovoAddressBookService.getOrCreateGlobalAddressBookId(request.pickup.address);
        }
      } catch (err) {
        console.error('Error getting/creating global Glovo address book ID:', err);
      }

      try {
        const { getGeocodeData } = await import('../utils/geocode.util');
        const geo = await getGeocodeData(request.delivery.address);
        if (geo) {
          geocodedDelivery.formattedAddress = geo.formattedAddress;
          geocodedDelivery.coordinates = geo.coordinates;
        }
      } catch (err) {
        console.error('Error geocoding delivery address for Glovo:', err);
      }
    }

    const activePartners = await getActiveLogisticsPartners();
    const providers = [];
    const pickupCountry = request.pickup.countryName?.trim().toLowerCase();
    const deliveryCountry = request.delivery.countryName?.trim().toLowerCase();
    
    if (pickupCountry && deliveryCountry && pickupCountry !== deliveryCountry) {
      if (activePartners.includes('dhl')) {
        providers.push({ name: 'DHL', fn: this.dhl.getQuote.bind(this.dhl) });
      }
    } else {
      if (activePartners.includes('faramove')) {
        providers.push({ name: 'Faramove', fn: this.faramove.getQuote.bind(this.faramove) });
      }
      if (activePartners.includes('fez')) {
        providers.push({ name: 'Fez', fn: this.fez.getQuote.bind(this.fez) });
      }
      if (pickupState === 'lagos' && deliveryState === 'lagos' && activePartners.includes('glovo')) {
        providers.push({
          name: 'Glovo',
          fn: (req: any) => {
            const meta = { ...req.meta, glovoAddressBookId };
            const delivery = {
              ...req.delivery,
              formattedAddress: geocodedDelivery.formattedAddress || req.delivery.address,
              coordinates: geocodedDelivery.coordinates || req.delivery.coordinates,
            };
            return this.glovo.getQuote({ ...req, meta, delivery });
          }
        });
      }
      if (activePartners.includes('gig')) {
        providers.push({ name: 'Gig', fn: this.gig.getQuote.bind(this.gig) });
      }
      if (activePartners.includes('dhl')) {
        providers.push({ name: 'DHL', fn: this.dhl.getQuote.bind(this.dhl) });
      }
    }

    const results = await Promise.allSettled(
      providers.map(async (provider) => {
        try {
          const quote = await provider.fn(request);
          return {
            ...quote,
            partner: provider.name.toLowerCase()
          };
        } catch (err) {
          console.error(`Aggregator: Error from ${provider.name}:`, err?.message || err);
          throw err;
        }
      })
    );

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    return fulfilled.map(r => (r as PromiseFulfilledResult<any>).value);
  }

  /**
   * Generate standardized providerId for order creation using database IDs
   * Each provider's providerId corresponds to their database record
   */
  private async generateProviderId(providerName: string, quote: any): Promise<string> {
    const normalizedProvider = providerName.toLowerCase();
    
    // Get the database ID for this provider
    const { data: partner, error } = await (await import('../auth/supabase.client')).supabase
      .from('logistics_partner')
      .select('id')
      .eq('name', normalizedProvider)
      .single();
    
    if (partner?.id) {
      return partner.id.toString();
    }
    
    // If provider doesn't exist in database, create it (should not happen in normal flow)
    console.warn(`Provider ${normalizedProvider} not found in database, auto-creating...`);
    const displayName = normalizedProvider.charAt(0).toUpperCase() + normalizedProvider.slice(1);
    const { data: newPartner, error: insertError } = await (await import('../auth/supabase.client')).supabase
      .from('logistics_partner')
      .insert([
        {
          name: normalizedProvider,
          display_name: displayName,
          isActive: true,
          created_at: new Date().toISOString(),
        },
      ])
      .select('id')
      .single();
    
    if (newPartner?.id) {
      return newPartner.id.toString();
    }
    
    // Fallback - should not reach here
    throw new Error(`Failed to get or create provider ID for ${normalizedProvider}`);
  }

  /**
   * Standardize ETA formats across providers
   */
  private standardizeETA(eta: string): string {
    if (!eta || eta === 'N/A') return 'N/A';
    
    // Convert various ETA formats to standardized format
    const etaLower = eta.toLowerCase();
    
    // Handle day formats
    if (etaLower.includes('day')) {
      const days = etaLower.match(/(\d+)\s*day/);
      return days ? `${days[1]} day${parseInt(days[1]) > 1 ? 's' : ''}` : eta;
    }
    
    // Handle hour formats
    if (etaLower.includes('hour')) {
      const hours = etaLower.match(/(\d+)\s*hour/);
      return hours ? `${hours[1]} hour${parseInt(hours[1]) > 1 ? 's' : ''}` : eta;
    }
    
    // Handle minute formats
    if (etaLower.includes('min')) {
      const minutes = etaLower.match(/(\d+)\s*min/);
      return minutes ? `${minutes[1]} minutes` : eta;
    }
    
    return eta;
  }

  /**
   * Standardize service levels across providers
   */
  private standardizeServiceLevel(serviceType: string, providerName: string): string {
    if (!serviceType) return 'standard';
    
    const serviceLower = serviceType.toLowerCase();
    
    // Map various service types to standard levels
    if (serviceLower.includes('express') || serviceLower.includes('premium')) {
      return 'express';
    }
    
    if (serviceLower.includes('economy') || serviceLower.includes('saver')) {
      return 'economy';
    }
    
    if (serviceLower.includes('same') || serviceLower.includes('urgent')) {
      return 'sameday';
    }
    
    return 'standard';
  }

  /**
   * Extract only essential metadata needed for order creation and display
   */
  private extractEssentialMeta(meta: any, providerName: string): any {
    if (!meta) return {};
    
    const normalizedProvider = providerName.toLowerCase();
    
    switch (normalizedProvider) {
      case 'glovo':
        return {
          quoteId: meta.quoteId,
          expiresAt: meta.expiresAt,
          distanceInMeters: meta.distanceInMeters,
          currencyCode: meta.currencyCode
        };
      
      case 'faramove':
        return {
          weight_range: meta.weight_range,
          distance_in_km: meta.raw?.distance_in_km,
          vehicle_type: meta.raw?.quotes?.[0]?.weight_range?.vehicle_type?.[0]?.name
        };
      
      case 'fez':
        return {
          state: meta.fezCost?.Cost?.state,
          cost: meta.fezCost?.Cost?.cost
        };
      
      case 'gig':
        return {
          CurrencyCode: meta.CurrencyCode,
          isWithinProcessingTime: meta.isWithinProcessingTime
        };
      
      case 'dhl':
        // Extract only the essential info from DHL's verbose response
        const product = meta.products?.[0];
        return {
          productCode: meta.productCode,
          productName: product?.productName,
          weight: product?.weight,
          pickupCapabilities: {
            cutoffTime: product?.pickupCapabilities?.localCutoffDateAndTime,
            pickupEarliest: product?.pickupCapabilities?.pickupEarliest,
            pickupLatest: product?.pickupCapabilities?.pickupLatest
          },
          deliveryCapabilities: {
            estimatedDelivery: product?.deliveryCapabilities?.estimatedDeliveryDateAndTime,
            transitDays: product?.deliveryCapabilities?.totalTransitDays
          }
        };
      
      default:
        return meta;
    }
  }

  // TODO: Add createOrder, trackOrder, cancelOrder
}
