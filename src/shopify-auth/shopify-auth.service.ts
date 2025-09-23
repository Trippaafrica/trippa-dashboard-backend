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
    if (!existingBusiness) {
      // Do not create new business, only allow update
      throw new Error('Business does not exist. Registration required.');
    }
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
    return { success: true, businessId: updatedBusiness.id };
  }
    async handleShopifyRegister(data: any) {
      const { shopify_access_token, business_name, email, phone, password, shopGid, shopdomain } = data;
      if (!email) {
        throw new Error('email is required');
      }
      let supabase_user_id = null;
      // Only create Supabase user if password is provided, but password is not mandatory
      if (password) {
        // Create Supabase user using Admin API
        const adminUrl = process.env.SUPABASE_URL + '/auth/v1/admin/users';
        const serviceKey = process.env.SUPABASE_SERVICE_KEY;
        const userPayload = {
          email,
          password,
          email_confirm: true
        };
        try {
          const response = await fetch(adminUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': serviceKey,
              'Authorization': `Bearer ${serviceKey}`
            },
            body: JSON.stringify(userPayload)
          });
          if (!response.ok) {
            const error = await response.json();
            throw new Error('Supabase user creation failed: ' + JSON.stringify(error));
          }
          const user = await response.json();
          supabase_user_id = user.id;
        } catch (err) {
          throw err;
        }
      }
      // Check if business already exists by email
      const { data: existingBusiness, error: fetchError } = await supabase
        .from('business')
        .select('*')
        .eq('email', email)
        .single();
      if (fetchError && fetchError.code !== 'PGRST116') {
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
          supabase_user_id,
          shopGid,
          shopdomain,
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
        // Create new business (password is optional)
        const createPayload = {
          business_name,
          email,
          phone,
          shopify_access_token,
          type: 'shopify',
          status: 'active',
          supabase_user_id,
          shopGid,
          shopdomain,
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
