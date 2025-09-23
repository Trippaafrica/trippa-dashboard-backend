import { MARKUP_FEE } from './constants';
import { Injectable, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { TableUpdatesGateway } from '../gateways/table-updates.gateway';
import { WalletService } from '../business/wallet.service';
import { supabase } from '../auth/supabase.client';

import { CreateOrderDto } from './types';
import { GlovoAdapter } from './adapters/glovo.adapter';
import { FaramoveAdapter } from './adapters/faramove.adapter';
import { FezAdapter } from './adapters/fez.adapter';
import { GigAdapter } from './adapters/gig.adapter';
import { DhlAdapter } from './adapters/dhl/dhl.adapter';

@Injectable()
export class LogisticsPartnerService implements OnModuleInit {
  /**
   * Public method to get the correct adapter by partner name
   */
  public getAdapterByName(partnerName: string) {
    const normalizedPartner = partnerName?.toLowerCase();
    const adapterMap = {
      glovo: this.glovoAdapter,
      faramove: this.faramoveAdapter,
      fez: this.fezAdapter,
      gig: this.gigAdapter,
      dhl: this.dhlAdapter,
    };
    return adapterMap[normalizedPartner];
  }
  // List of all supported partners (add new ones here)
  static readonly SUPPORTED_PARTNERS = [
    { name: 'glovo', displayName: 'Glovo' },
    { name: 'faramove', displayName: 'Faramove' },
    { name: 'fez', displayName: 'Fez' },
    { name: 'gig', displayName: 'Gig Logistics' },
    { name: 'dhl', displayName: 'DHL' },
  ];

  async onModuleInit() {
    // Ensure all supported partners exist in the DB
    for (const partner of LogisticsPartnerService.SUPPORTED_PARTNERS) {
      const normalizedName = partner.name.toLowerCase();
      const { data, error } = await supabase
        .from('logistics_partner')
        .select('id')
        .eq('name', normalizedName)
        .single();
      if (!data) {
        await supabase.from('logistics_partner').insert([
          {
            name: normalizedName,
            display_name: partner.displayName,
            isActive: true,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    }
  }

  constructor(
    private glovoAdapter: GlovoAdapter,
    private faramoveAdapter: FaramoveAdapter,
    private fezAdapter: FezAdapter,
    private gigAdapter: GigAdapter,
    private dhlAdapter: DhlAdapter,
    @Inject(forwardRef(() => WalletService)) private walletService: WalletService,
    @Inject(forwardRef(() => TableUpdatesGateway)) private tableUpdatesGateway: TableUpdatesGateway,
  ) {}

  async createOrder(body: CreateOrderDto, businessId?: string, skipWalletDebit?: boolean) {

    console.log('[CreateOrder] Secure recalculation of quote for partner:', body.partner);
    const { partner, partnerId, request } = body;
    const normalizedPartner = partner?.toLowerCase();
    
    const adapterMap = {
      glovo: this.glovoAdapter,
      faramove: this.faramoveAdapter,
      fez: this.fezAdapter,
      gig: this.gigAdapter,
      dhl: this.dhlAdapter,
    };
    const adapter = adapterMap[normalizedPartner];
    if (!adapter) throw new Error('Invalid logistics partner');

  // Validate partner exists in database and is active
  // Example: Broadcast table update after creating an order (customize as needed)
  // this.tableUpdatesGateway.broadcastTableUpdate('orders', { action: 'create', data: body });
    let partnerData;
    const { data: foundPartner, error: partnerError } = await supabase
      .from('logistics_partner')
      .select('id, isActive, name')
      .eq('name', normalizedPartner)
      .single();
    
    if (!foundPartner) {
      // Auto-register new partners if they don't exist
      const displayName = normalizedPartner.charAt(0).toUpperCase() + normalizedPartner.slice(1);
      const { data: newPartner, error: newPartnerError } = await supabase
        .from('logistics_partner')
        .insert([
          {
            name: normalizedPartner,
            display_name: displayName,
            isActive: true,
            created_at: new Date().toISOString(),
          },
        ])
        .select('id, isActive, name')
        .single();
      if (!newPartner) {
        console.error('Failed to register new logistics partner:', newPartnerError);
        throw new Error('Failed to register new logistics partner');
      }
      if (!newPartner.isActive) throw new Error('This logistics partner is inactive');
      partnerData = newPartner;
    } else if (!foundPartner.isActive) {
      throw new Error('This logistics partner is inactive');
    } else {
      partnerData = foundPartner;
    }

    // Validate partnerId if provided - it must match the database partner ID
    if (partnerId && partnerId !== partnerData.id.toString()) {
      throw new Error(`Invalid partnerId: ${partnerId}. Expected partnerId for ${normalizedPartner} is ${partnerData.id}`);
    }

    // Use partnerId from quote response or database lookup
    const effectivePartnerId = partnerId || partnerData.id.toString();

    // --- OPTIMIZED SECURE QUOTE RECALCULATION ---
    // Call only the selected provider for faster order creation
    let selectedQuote;
    try {
      // Prepare request with necessary metadata for specific providers
      let optimizedRequest = { ...request };
      // Ensure coordinates are present for Faramove quote recalculation
      if (normalizedPartner === 'faramove') {
        // If coordinates are missing, geocode pickup and delivery addresses
        if (!optimizedRequest.pickup?.coordinates || optimizedRequest.pickup.coordinates.length < 2) {
          try {
            const { getGeocodeData } = await import('../utils/geocode.util');
            const geo = await getGeocodeData(optimizedRequest.pickup.address);
            if (geo?.coordinates) {
              optimizedRequest.pickup = {
                ...optimizedRequest.pickup,
                coordinates: geo.coordinates,
              };
            }
          } catch (err) {
            console.error('Error geocoding pickup address for Faramove:', err);
          }
        }
        if (!optimizedRequest.delivery?.coordinates || optimizedRequest.delivery.coordinates.length < 2) {
          try {
            const { getGeocodeData } = await import('../utils/geocode.util');
            const geo = await getGeocodeData(optimizedRequest.delivery.address);
            if (geo?.coordinates) {
              optimizedRequest.delivery = {
                ...optimizedRequest.delivery,
                coordinates: geo.coordinates,
              };
            }
          } catch (err) {
            console.error('Error geocoding delivery address for Faramove:', err);
          }
        }
      }
      
      // Add Glovo-specific metadata if needed
      if (normalizedPartner === 'glovo') {
        const businessIdFromRequest = request.meta?.businessId || businessId;
        if (businessIdFromRequest) {
          try {
            const { data: business, error } = await supabase
              .from('business')
              .select('glovo_address_book_id')
              .eq('id', businessIdFromRequest)
              .single();
            if (!error && business?.glovo_address_book_id) {
              optimizedRequest.meta = {
                ...optimizedRequest.meta,
                glovoAddressBookId: business.glovo_address_book_id
              };
            }
          } catch (err) {
            console.error('Error fetching Glovo address book ID:', err);
          }
        }
        
        // Geocode delivery address for Glovo
        try {
          const { getGeocodeData } = await import('../utils/geocode.util');
          const geo = await getGeocodeData(request.delivery.address);
          if (geo) {
            optimizedRequest.delivery = {
              ...optimizedRequest.delivery,
              formattedAddress: geo.formattedAddress,
              coordinates: geo.coordinates,
            };
          }
        } catch (err) {
          console.error('Error geocoding delivery address for Glovo:', err);
        }
      }

      // Call only the selected provider's getQuote method
      console.log(`[CreateOrder] Getting quote from ${normalizedPartner} only`);
      const quote = await adapter.getQuote(optimizedRequest);
      selectedQuote = {
        ...quote,
        partner: normalizedPartner
      };
      console.log(`[CreateOrder] Single provider quote result:`, selectedQuote);
      
    } catch (error) {
      console.error(`[CreateOrder] Failed to get quote from ${normalizedPartner}:`, error);
      throw new Error(`Could not recalculate quote for ${normalizedPartner}: ${error.message}`);
    }
    const providerPrice = Number(selectedQuote.price || 0);
    let markup = MARKUP_FEE;
    if (normalizedPartner === 'dhl') {
      markup = Math.round(providerPrice * 0.15);
    }
    const totalDeliveryCostNaira = providerPrice + markup;
    const totalDeliveryCostKobo = Math.round(totalDeliveryCostNaira * 100);

    // 2. Fetch business wallet balance (in kobo)
    let walletBalanceKobo = 0;
    if (!skipWalletDebit) {
      if (!businessId) {
        throw new Error('Business ID is required to validate wallet balance');
      }
      const { data: business, error: businessError } = await supabase
        .from('business')
        .select('wallet_balance')
        .eq('id', businessId)
        .single();
      if (businessError || !business) {
        throw new Error('Could not fetch wallet balance for this business');
      }
      walletBalanceKobo = Number(business.wallet_balance || 0);

      // 3. Validate
      if (walletBalanceKobo < totalDeliveryCostKobo) {
        // Throw a proper HttpException for frontend to catch
        // Import HttpException if not already
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { HttpException } = await import('@nestjs/common');
        throw new HttpException({
          message: 'Insufficient wallet balance to place this order.',
          code: 'INSUFFICIENT_WALLET_BALANCE',
          details: {
            required: totalDeliveryCostNaira,
            available: walletBalanceKobo / 100,
          }
        }, 400);
      }
    }

    // Use provided order_id if available, otherwise generate custom order_id
    let customOrderId = body.order_id;
    if (!customOrderId) {
      const { generateCustomOrderId } = await import('../utils/order-id.util');
      customOrderId = generateCustomOrderId();
    }
    
    // 1. Call the adapter FIRST to validate with external provider before any database operations
    let orderResult;
    let tempOrderId = `temp-${Date.now()}`; // Temporary ID for providers that need an ID
    
    try {
      if (partner?.toLowerCase() === 'fez') {
        // Fez needs an actual order ID, so we'll need to handle this case specially
        orderResult = await adapter.createOrder(tempOrderId, request);
      } else if (partner?.toLowerCase() === 'glovo') {
        // Use the real quoteId from request.meta.quoteId if available, otherwise use effectivePartnerId
        const realQuoteId = request?.meta?.quoteId || effectivePartnerId;
        if (!realQuoteId) {
          throw new Error('Missing Glovo quoteId in request.meta.quoteId or providerId');
        }
        orderResult = await adapter.createOrder(realQuoteId, request);
      } else {
        orderResult = await adapter.createOrder(effectivePartnerId, request);
      }
      console.log('[CreateOrder] Adapter result:', orderResult);
    } catch (adapterError) {
      console.error('[CreateOrder] Adapter failed:', adapterError.message);
      // Re-throw the adapter error without creating any database records
      throw adapterError;
    }

    // 2. Only proceed with database operations if adapter call succeeded
    let orderId;
    let insertedData;
    
    try {
      // Calculate delivery cost: provider price + markup
      const deliveryCostObj = {
        total_delivery_cost: Number((providerPrice + markup).toFixed(2)),
        trippa_fee: markup,
        logistic_delivery_cost: Number(providerPrice.toFixed(2))
      };

      // Insert order with all data including partner response
      const orderRow = {
        business_id: businessId,
        partner_id: partnerData.id,
        delivery_cost: deliveryCostObj,
        order_data: body,
        partner_response: orderResult,
        status: orderResult?.status || 'pending',
        created_at: new Date().toISOString(),
        order_id: customOrderId,
        shopify_order_id: body.shopifyOrderId || null, // Optional Shopify order ID
      };

      const { data: inserted, error: insertError } = await supabase
        .from('order')
        .insert([orderRow])
        .select('id, order_id')
        .single();
        
      if (insertError || !inserted?.id) {
        console.error('[CreateOrder] Failed to insert order:', insertError);
        throw new Error('Failed to insert order: ' + (insertError?.message || 'Unknown error'));
      }
      
      orderId = inserted.id;
      insertedData = inserted;

      // 3. Deduct from wallet after successful order creation
      if (!skipWalletDebit) {
        const debitResult = await this.walletService.debitWallet(businessId, totalDeliveryCostKobo);
        if (!debitResult) {
          throw new Error('Failed to debit wallet for delivery cost');
        }
      }

      return orderResult;
      
    } catch (dbOrWalletError) {
      // If database operations or wallet deduction fail, we have a problem because the external order exists
      console.error('[CreateOrder] Database/Wallet operation failed after successful adapter call:', dbOrWalletError.message);
      
      // Attempt to cancel the external order if possible
      try {
        if (orderResult?.orderId || orderResult?.trackingNumber) {
          const cancelId = orderResult.orderId || orderResult.trackingNumber;
          console.log(`[CreateOrder] Attempting to cancel external order: ${cancelId}`);
          await adapter.cancelOrder(cancelId);
          console.log(`[CreateOrder] Successfully cancelled external order: ${cancelId}`);
        }
      } catch (cancelError) {
        console.error('[CreateOrder] Failed to cancel external order:', cancelError.message);
        // Log this as a critical issue that needs manual intervention
        console.error('[CRITICAL] Manual intervention required: External order exists but local order failed');
      }

      // Clean up any inserted order if it exists
      if (orderId) {
        try {
          await supabase.from('order').delete().eq('id', orderId);
          console.log('[CreateOrder] Cleaned up failed order record');
        } catch (cleanupError) {
          console.error('[CreateOrder] Failed to cleanup order record:', cleanupError.message);
        }
      }

      throw dbOrWalletError;
    }
  }
  async getPartnersSummary() {
    // Fetch all partners
    const { data: partners, error: partnerError } = await supabase
      .from('logistics_partner')
      .select('*');
    if (partnerError) throw partnerError;
    // For each partner, aggregate order stats
    const summaries = await Promise.all((partners || []).map(async partner => {
      // Count orders
      const { count: totalDeliveries, error: countError } = await supabase
        .from('order')
        .select('id', { count: 'exact', head: true })
        .eq('partner_id', partner.id);
      if (countError) throw countError;
      // Sum logistic_delivery_cost from delivery_cost JSONB
      const { data: costData, error: sumError } = await supabase
        .from('order')
        .select('delivery_cost')
        .eq('partner_id', partner.id);
      if (sumError) throw sumError;
      const totalDeliveryCost = (costData || []).reduce((sum, o) => {
        if (o.delivery_cost && typeof o.delivery_cost === 'object' && o.delivery_cost.logistic_delivery_cost) {
          return sum + Number(o.delivery_cost.logistic_delivery_cost || 0);
        }
        return sum;
      }, 0);
      return {
        id: partner.id,
        name: partner.name,
        isActive: partner.isActive,
        totalDeliveries: totalDeliveries || 0,
        totalDeliveryCost
      };
    }));
    return summaries;
  }

  async setPartnerStatus(id: number, isActive: boolean) {
    const { data, error } = await supabase
      .from('logistics_partner')
      .update({ isActive })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}
