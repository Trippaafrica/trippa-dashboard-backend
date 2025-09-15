import { Injectable } from '@nestjs/common';
import { supabase } from '../auth/supabase.client';

@Injectable()
export class ShopifyAuthService {
  async handleShopifyCallback(data: any) {
    const { shopify_access_token, business_name, email, phone } = data;
    // Check if business already exists by email
    const { data: existingBusiness, error: fetchError } = await supabase
      .from('business')
      .select('*')
      .eq('email', email)
      .single();
    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116: No rows found
      throw fetchError;
    }
    let business;
    if (existingBusiness) {
      // Update existing business
      const updatePayload = {
        shopify_access_token,
        type: 'shopify',
        business_name,
        phone,
        updated_at: new Date().toISOString(),
      };
      const { data: updatedBusiness, error: updateError } = await supabase
        .from('business')
        .update(updatePayload)
        .eq('id', existingBusiness.id)
        .select()
        .single();
      if (updateError) throw updateError;
      business = updatedBusiness;
    } else {
      // Create new business
      const createPayload = {
        business_name,
        email,
        phone,
        shopify_access_token,
        type: 'shopify',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { data: newBusiness, error: createError } = await supabase
        .from('business')
        .insert([createPayload])
        .select()
        .single();
      if (createError) throw createError;
      business = newBusiness;
    }
    return { success: true, businessId: business.id };
  }
}
