import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GitInsuranceService } from './git-insurance.service';
import { supabase } from '../auth/supabase.client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class OrderService {
  constructor(
    private readonly gitInsuranceService: GitInsuranceService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  async createOrder(partnerName: string, deliveryCost: number, insuranceEnabled: boolean, insurancePayload?: any) {
    // 1. Ensure partner exists or create if not
    let { data: partner, error: partnerError } = await supabase
      .from('logistics_partner')
      .select('*')
      .eq('name', partnerName)
      .single();
    if (partnerError && partnerError.code !== 'PGRST116') throw partnerError;
    if (!partner) {
      // Insert new partner
      const { data: newPartner, error: insertError } = await supabase
        .from('logistics_partner')
        .insert([{ name: partnerName, isActive: true }])
        .select()
        .single();
      if (insertError) throw insertError;
      partner = newPartner;
    }
    // 2. Handle insurance if enabled
    let insuranceDetails = null;
    let totalCost = deliveryCost;
    if (insuranceEnabled && insurancePayload) {
      const insuranceResponse = await this.gitInsuranceService.buyGitOnDemandInsurance(insurancePayload);
      if (insuranceResponse?.data?.policy) {
        insuranceDetails = insuranceResponse.data.policy;
        // Add insurance fee to total cost
        totalCost += insuranceDetails.market_price || 0;
      }
    }
    // 3. Create the order
    const { data: order, error: orderError } = await supabase
      .from('order')
      .insert([{ partner_id: partner.id, deliveryCost: totalCost, insuranceDetails }])
      .select()
      .single();
    if (orderError) throw orderError;

    // Example: create notification for shipment order created
    if (order && order.business_id) {
      await this.notificationsService.createNotification(
        order.business_id,
        'shipment_order_created',
        'A new shipment order has been created.'
      );
    }
    return order;
  }
}
