import { Controller, Get } from '@nestjs/common';
import { supabase } from '../auth/supabase.client';

@Controller('businesses')
export class BusinessAnalyticsController {
  // Returns all businesses with their total deliveries (orders count)
  @Get('with-deliveries')
  async getBusinessesWithDeliveries() {
    // Get all businesses
    const { data: businesses, error: businessError } = await supabase
      .from('business')
      .select('*');
    if (businessError) throw businessError;

    // Get all orders (shipments)
    const { data: orders, error: orderError } = await supabase
      .from('order')
      .select('id, business_id');
    if (orderError) throw orderError;

    // Map businessId to total deliveries
    const deliveriesMap = {};
    for (const order of orders || []) {
      if (order.business_id) {
        deliveriesMap[order.business_id] = (deliveriesMap[order.business_id] || 0) + 1;
      }
    }

    // Attach totalDeliveries to each business
    const result = (businesses || []).map(biz => ({
      ...biz,
      totalDeliveries: deliveriesMap[biz.id] || 0,
    }));
    return result;
  }
}
