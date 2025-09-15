import { Injectable, Logger } from '@nestjs/common';
import { MARKUP_FEE } from '../logistics/constants';
import { supabase } from '../auth/supabase.client';
import { ScheduledShipment } from './scheduled-shipment.entity';
import { CreateOrderService } from '../create-order/create-order.service';
import { BusinessService } from '../business/business.service';
import { WalletService } from '../business/wallet.service';
import { generateCustomOrderId } from '../utils/order-id.util';

@Injectable()
export class ScheduledShipmentsService {
  private readonly logger = new Logger(ScheduledShipmentsService.name);

  constructor(
    private readonly createOrderService: CreateOrderService,
    private readonly businessService: BusinessService,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Create a scheduled shipment following the same pattern as regular orders
   */
  async createScheduledShipment(
    businessId: string,
    request: any,
    scheduledDate: Date,
    partnerName: string,
    partnerId?: string,
    trippaId?: string, // Pass trippa_id for scheduled shipment
    quote?: { price: number } // Pass selected quote for cost calculation
  ): Promise<ScheduledShipment> {
  this.logger.log(`=== CREATE SCHEDULED SHIPMENT START ===`);
  this.logger.log(`Parameters:`, { businessId, partnerName, scheduledDate, request });
    
    // Validate scheduled date (must be within 2 weeks from now)
    const now = new Date();
    const maxDate = new Date();
    maxDate.setDate(now.getDate() + 14);

    this.logger.log(`Date validation - Now: ${now.toISOString()}, Scheduled: ${scheduledDate?.toISOString()}, Max: ${maxDate.toISOString()}`);

    if (scheduledDate && (scheduledDate < now || scheduledDate > maxDate)) {
      throw new Error('Scheduled date must be within 2 weeks from now');
    }

    // Validate partner exists in database (following order creation pattern)
    this.logger.log(`Looking up partner by name: ${partnerName}`);
    const { data: partner, error: partnerError } = await supabase
      .from('logistics_partner')
      .select('id, name, isActive')
      .eq('name', partnerName.toLowerCase())
      .single();

    this.logger.log(`Partner lookup result:`, { partner, partnerError });

    if (partnerError || !partner || !partner.isActive) {
      throw new Error('Invalid or inactive logistics partner');
    }

    // Check wallet balance by fetching business data directly
    const { data: business, error: businessError } = await supabase
      .from('business')
      .select('wallet_balance')
      .eq('id', businessId)
      .single();

    if (businessError || !business) {
      throw new Error('Business not found');
    }

    const walletBalance = Number(business.wallet_balance || 0);

    // Automatically recalculate quote price using partner adapter (same as regular shipment)
    let markup = MARKUP_FEE;
    let providerPrice;
    let selectedQuote;
    const normalizedPartner = partnerName?.toLowerCase();
    // Use public getAdapterByName method
    const adapter = this.createOrderService.partnerService.getAdapterByName(normalizedPartner);
    if (!adapter) throw new Error('Invalid logistics partner');

    // Prepare request for quote
    let optimizedRequest = { ...request };
    // Glovo-specific metadata
    if (normalizedPartner === 'glovo') {
      // ...existing code for Glovo address book and geocode if needed...
    }
    // Get quote from adapter
    selectedQuote = await adapter.getQuote(optimizedRequest);
    providerPrice = Number(selectedQuote.price || 0);
    if (normalizedPartner === 'dhl') {
      providerPrice = Math.round(providerPrice / 1.15);
      markup = Math.round(providerPrice * 0.15);
    } else {
      if (providerPrice > MARKUP_FEE) {
        providerPrice = providerPrice - MARKUP_FEE;
      }
    }
    const deliveryCostObj = {
      total_delivery_cost: Number((providerPrice + markup).toFixed(2)),
      trippa_fee: markup,
      logistic_delivery_cost: Number(providerPrice.toFixed(2))
    };

    if (walletBalance < deliveryCostObj.total_delivery_cost) {
      throw new Error('Insufficient wallet balance for scheduled shipment');
    }

    // Deduct payment from wallet using the same method as regular orders
    const debitResult = await this.walletService.debitWallet(businessId, Math.round(deliveryCostObj.total_delivery_cost * 100));
    if (!debitResult) {
      throw new Error('Failed to debit wallet for scheduled shipment');
    }

    this.logger.log(`Deducted ₦${deliveryCostObj.total_delivery_cost} from wallet for business ${businessId}: Scheduled shipment payment`);

    // Create scheduled shipment record (following order table structure)
    this.logger.log(`=== INSERTING TO DATABASE ===`);
    this.logger.log(`business_id: "${businessId}" (type: ${typeof businessId})`);
    this.logger.log(`partner.id: "${partner.id}" (type: ${typeof partner.id})`);
    this.logger.log(`Full partner object:`, partner);
    
    const { data: scheduledShipment, error } = await supabase
      .from('scheduled_shipments')
      .insert([{
        business_id: businessId,
        partner_id: partner.id,
        delivery_cost: deliveryCostObj,
        order_data: request,
        status: 'scheduled',
        scheduled_date: scheduledDate ? scheduledDate.toISOString() : null,
        quote_data: {},
        payment_processed: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        order_id: trippaId || generateCustomOrderId() // Always generate a custom order_id if not provided
      }])
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to create scheduled shipment:', error);
      throw new Error('Failed to create scheduled shipment');
    }

    this.logger.log(`Created scheduled shipment ${scheduledShipment.id} for business ${businessId}`);
    return scheduledShipment;
  }

  /**
   * Get scheduled shipments for a user with pagination and filters
   */
  async getScheduledShipments(
    businessId: string, 
    options: { page?: number; limit?: number; status?: string; search?: string } = {}
  ): Promise<{ data: ScheduledShipment[]; total: number }> {
    const { page = 1, limit = 10, status, search } = options;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('scheduled_shipments')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      // Search in order data or other relevant fields
      query = query.or(`order_data->request->delivery->customerName.ilike.%${search}%,logistics_partner.ilike.%${search}%`);
    }

    query = query.range(offset, offset + limit - 1);

    const { data: shipments, error, count } = await query;

    if (error) {
      this.logger.error('Failed to fetch scheduled shipments:', error);
      throw new Error('Failed to fetch scheduled shipments');
    }

    return {
      data: shipments || [],
      total: count || 0
    };
  }

  /**
   * Get a specific scheduled shipment by ID
   */
  async getScheduledShipmentById(id: string, businessId: string): Promise<ScheduledShipment> {
    const { data: shipment, error } = await supabase
      .from('scheduled_shipments')
      .select('*')
      .eq('id', id)
      .eq('business_id', businessId)
      .single();

    if (error) {
      this.logger.error(`Failed to fetch scheduled shipment ${id}:`, error);
      throw new Error('Scheduled shipment not found');
    }

    return shipment;
  }

  /**
   * Get all pending scheduled shipments that are due for processing
   */
  async getDueScheduledShipments(): Promise<ScheduledShipment[]> {
    const now = new Date().toISOString();
    const { data: shipments, error } = await supabase
      .from('scheduled_shipments')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_date', now);

    if (error) {
      this.logger.error('Failed to fetch due scheduled shipments:', error);
      return [];
    }

    return shipments || [];
  }

  /**
   * Process a scheduled shipment by creating the actual order
   */
  async processScheduledShipment(scheduledShipment: ScheduledShipment): Promise<void> {
    // Extra guard: Only process shipments with status 'scheduled'
    if (scheduledShipment.status !== 'scheduled') {
      this.logger.warn(`Skipping scheduled shipment ${scheduledShipment.id} with status '${scheduledShipment.status}'. No order will be created.`);
      return;
    }
    try {
      this.logger.log(`Processing scheduled shipment ${scheduledShipment.id}`);

      // Get partner name from partner_id
      const { data: partner } = await supabase
        .from('logistics_partner')
        .select('name')
        .eq('id', scheduledShipment.partner_id)
        .single();

      if (!partner) {
        throw new Error('Partner not found');
      }

      // Create the actual order using the stored data, passing the scheduled order_id
      // Do NOT debit wallet again; payment was already processed at scheduling time
      const orderResult = await this.createOrderService.createOrder({
        partner: partner.name,
        partnerId: scheduledShipment.partner_id.toString(), // Convert number to string
        request: scheduledShipment.order_data,
        order_id: scheduledShipment.order_id
      }, scheduledShipment.business_id, true); // skipWalletDebit = true

      // Update scheduled shipment status (use 'completed' to match table constraint)
      await this.updateScheduledShipmentStatus(
        scheduledShipment.id,
        'created',
        undefined,
        new Date().toISOString()
      );

      this.logger.log(`Successfully processed scheduled shipment ${scheduledShipment.id}`);

    } catch (error) {
      this.logger.error(`Failed to process scheduled shipment ${scheduledShipment.id}:`, error);
      // Update status to failed
      await this.updateScheduledShipmentStatus(
        scheduledShipment.id,
        'failed',
        error.message
      );
      // Optionally refund the payment if order creation failed
      await this.refundPayment(scheduledShipment);
    }
  }

  /**
   * Cancel a scheduled shipment and refund payment
   */
  async cancelScheduledShipment(scheduledShipmentId: string, businessId: string): Promise<void> {
  console.log('Cancel request:', { scheduledShipmentId, businessId });
    const { data: scheduledShipment, error } = await supabase
      .from('scheduled_shipments')
      .select('*')
      .eq('id', scheduledShipmentId)
      .eq('business_id', businessId)
      .in('status', ['pending', 'scheduled'])
      .single();
  console.log('Supabase result:', { scheduledShipment, error });

    if (error || !scheduledShipment) {
      throw new Error('Scheduled shipment not found or cannot be cancelled');
    }

    // Refund payment
    await this.refundPayment(scheduledShipment);

    // Update status
    await this.updateScheduledShipmentStatus(
      scheduledShipmentId,
      'cancelled',
      'Cancelled by user'
    );

    this.logger.log(`Cancelled scheduled shipment ${scheduledShipmentId}`);
  }

  /**
   * Get scheduled shipments for a business
   */
  async getBusinessScheduledShipments(
    businessId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ data: ScheduledShipment[]; total: number }> {
    const offset = (page - 1) * limit;

    const [dataQuery, countQuery] = await Promise.all([
      supabase
        .from('scheduled_shipments')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1),
      
      supabase
        .from('scheduled_shipments')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
    ]);

    return {
      data: dataQuery.data || [],
      total: countQuery.count || 0
    };
  }

  /**
   * Private helper methods
        const debitResult = await this.walletService.debitWallet(businessId, Math.round(deliveryCostObj.total_delivery_cost * 100));
   */
  private async refundPayment(scheduledShipment: ScheduledShipment): Promise<void> {
    if (!scheduledShipment.payment_processed) {
      return; // No payment to refund
    }

    try {
      // Use WalletService to credit the refund - following the same pattern as regular orders
      // Since we don't store transaction IDs, we'll use a credit operation
      const { data: business, error } = await supabase
        .from('business')
        .select('wallet_balance')
        .eq('id', scheduledShipment.business_id)
        .single();

      if (!error && business) {
        // Convert naira to kobo for refund
        const refundAmount = Math.round(scheduledShipment.delivery_cost.total_delivery_cost * 100);
        const newBalance = Number(business.wallet_balance || 0) + refundAmount;
        await supabase
          .from('business')
          .update({ wallet_balance: newBalance })
          .eq('id', scheduledShipment.business_id);

        // Log the refund transaction
        await supabase
          .from('wallet_transactions')
          .insert([{
            business_id: scheduledShipment.business_id,
            amount: refundAmount,
            type: 'credit',
            status: 'success',
            description: `Refund for cancelled scheduled shipment ${scheduledShipment.id}`,
            created_at: new Date().toISOString()
          }]);
      }

      this.logger.log(`Refunded ₦${scheduledShipment.delivery_cost.total_delivery_cost} for scheduled shipment ${scheduledShipment.id}`);
    } catch (error) {
      this.logger.error(`Failed to refund payment for scheduled shipment ${scheduledShipment.id}:`, error);
    }
  }

  private async updateScheduledShipmentStatus(
    id: string,
    status: string,
    errorMessage?: string,
    processedAt?: string
  ): Promise<void> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    };

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    if (processedAt) {
      updateData.processed_at = processedAt;
    }

    this.logger.log(`Attempting to update scheduled shipment status`, { id, updateData });
    const { error, data } = await supabase
      .from('scheduled_shipments')
      .update(updateData)
      .eq('id', id);
    if (error) {
      this.logger.error(`Failed to update status for scheduled shipment ${id}:`, error, { updateData });
    } else if (!data) {
      this.logger.warn(`No scheduled shipment found to update for id ${id}.`, { updateData });
    } else {
      this.logger.log(`Updated status for scheduled shipment ${id} to '${status}'.`, { updateData });
    }
  }
}
