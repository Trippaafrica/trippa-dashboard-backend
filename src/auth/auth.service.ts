
import { Injectable } from '@nestjs/common';
import { Express } from 'express';
import { supabase } from './supabase.client';
import { v4 as uuidv4 } from 'uuid';
import { BusinessService } from '../business/business.service';

// Helper to decode JWT payload (no verification)
function decodeJwtPayload(token: string): any {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

@Injectable()
export class AuthService {
  constructor(private businessService: BusinessService) {}

  async signup(body: any) {
    const { email, password, phone, businessName } = body;
    // 1. Register with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) {
      return { error: error.message };
    }
    // 2. Check if phone number already exists
    const { data: existingPhone, error: phoneCheckError } = await supabase
      .from('business')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();
    if (phoneCheckError) {
      return { error: phoneCheckError.message };
    }
    if (existingPhone) {
      return { error: 'Phone number already in use by another business.' };
    }
    // Insert business record in Supabase public.business table (even if user id is missing)
    const businessData: any = {
      email,
      phone,
      business_name: businessName,
      supabase_user_id: data.user?.id || null,
      // Add other fields as needed (wallet_balance, pickup_address, profile_picture)
    };
    // Insert or upsert by email (so we don't create duplicates)
    const { error: insertError } = await supabase
      .from('business')
      .upsert([businessData], { onConflict: 'email' });
    if (insertError) {
      return { error: insertError.message };
    }
    // 3. Create wallet for business/user
    try {
      await this.businessService.createBusinessWallet({
        email,
        business_name: businessName,
        phone,
        supabase_user_id: data.user?.id || null,
        id: null,
      });
    } catch (e) {
      // Log error but don't block signup
      console.error('Failed to create wallet for user:', e);
    }
    // 4. Supabase sends confirmation email automatically
    return { message: 'Signup successful. Please check your email for confirmation link.' };
  }

  async login(body: any) {
    const { email, password, profile_picture, pickup_address, pickup_state, pickup_city, businessName, phone } = body;
    // 1. Authenticate with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return { error: error.message };
    }
    // 2. Ensure business record exists for this user and update user id if missing
    const supabaseUserId = data.user?.id;
    let business = null;
    if (supabaseUserId) {
      // Try to find by user id first
      let { data: businessArr } = await supabase
        .from('business')
        .select('*')
        .eq('supabase_user_id', supabaseUserId)
        .limit(1);
      business = businessArr && businessArr.length > 0 ? businessArr[0] : null;
      if (!business) {
        // Try to find by email (from signup)
        const { data: byEmailArr } = await supabase
          .from('business')
          .select('*')
          .eq('email', data.user.email)
          .limit(1);
        if (byEmailArr && byEmailArr.length > 0) {
          business = byEmailArr[0];
          // Update the record with the user id
          await supabase
            .from('business')
            .update({ supabase_user_id: supabaseUserId })
            .eq('email', data.user.email);
        } else {
          // Create business record if missing
          business = {
            email: data.user.email,
            phone: data.user.phone || phone || '',
            business_name: data.user.user_metadata?.businessName || businessName || '',
            supabase_user_id: supabaseUserId,
            profile_picture: profile_picture || '',
            pickup_address: pickup_address || '',
            pickup_state: pickup_state || '',
            pickup_city: pickup_city || '',
            api_key: uuidv4(),
            wallet_balance: 0,
            status: 'active',
          };
          await supabase.from('business').insert([business]);
        }
      }
      // Block login if business is inactive
      if (business && business.status && business.status !== 'active') {
        return { error: 'Account deactivated. Contact support@trippaafrica.com' };
      }
      // Now update any missing/empty fields
      const updateFields: any = {};
      if (!business.profile_picture && profile_picture) updateFields.profile_picture = profile_picture;
      if (!business.pickup_address && pickup_address) updateFields.pickup_address = pickup_address;
      if (!business.pickup_state && pickup_state) updateFields.pickup_state = pickup_state;
      if (!business.pickup_city && pickup_city) updateFields.pickup_city = pickup_city;
      if (!business.api_key) updateFields.api_key = uuidv4();
      if (business.wallet_balance === undefined || business.wallet_balance === null) updateFields.wallet_balance = 0;
      if (!business.business_name && (businessName || data.user.user_metadata?.businessName)) updateFields.business_name = businessName || data.user.user_metadata?.businessName;
      if (!business.phone && (phone || data.user.phone)) updateFields.phone = phone || data.user.phone;
      if (!business.email && data.user.email) updateFields.email = data.user.email;
      if (Object.keys(updateFields).length > 0) {
        await supabase
          .from('business')
          .update(updateFields)
          .eq('supabase_user_id', supabaseUserId);
      }
    }
    // 3. Return Supabase access token as JWT
    return {
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      user: data.user,
    };
  }

  async verifyOtp(body: any) {
    const { email, token, profile_picture, pickup_address, pickup_state, pickup_city, business_name, phone } = body;
    // 1. Verify OTP with Supabase
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    if (error) {
      return { error: error.message };
    }
    // 2. Find business by email in Supabase
    const { data: businessArr, error: findError } = await supabase
      .from('business')
      .select('*')
      .eq('email', email)
      .limit(1);
    if (findError || !businessArr || businessArr.length === 0) {
      return { error: 'Business not found' };
    }
    const business = businessArr[0];
    // 3. Prepare update fields
    let updateFields: any = {
      profile_picture: profile_picture || business.profile_picture || '',
      pickup_address: pickup_address || business.pickup_address || '',
      pickup_state: pickup_state || business.pickup_state || '',
      pickup_city: pickup_city || business.pickup_city || '',
      business_name: business_name || business.business_name || '',
      phone: phone || business.phone || '',
      email: email,
      wallet_balance: business.wallet_balance ?? 0,
    };
    // Generate API key if not set
    if (!business.api_key) {
      updateFields.api_key = uuidv4();
    }
    // 4. Update business record
    const { error: updateError } = await supabase
      .from('business')
      .update(updateFields)
      .eq('email', email);
    if (updateError) {
      return { error: updateError.message };
    }
    // 5. Return confirmation
    return { message: 'OTP verified. Business activated and profile updated.' };
  }

  async getBusiness(req: any) {
    // 1. Get JWT from Authorization header
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader) {
      return { error: 'No authorization header' };
    }
    const token = authHeader.replace('Bearer ', '');
    try {
      // 2. Decode JWT payload
      const decoded: any = decodeJwtPayload(token);
      const supabaseUserId = decoded?.sub;
      // 3. Find business by supabase_user_id in Supabase
      const { data: businessArr, error: findError } = await supabase
        .from('business')
        .select('*')
        .eq('supabase_user_id', supabaseUserId)
        .limit(1);
      if (findError || !businessArr || businessArr.length === 0) {
        return { error: 'Business not found' };
      }
      const business = businessArr[0];
      // 4. Map business_name to name for frontend compatibility
      return {
        ...business,
        name: business.business_name || business.name || '',
      };
    } catch (e) {
      return { error: 'Invalid token' };
    }
  }

    async uploadProfileImage(token: string, file: Express.Multer.File) {
    // 1. Decode user from token
    const payload = decodeJwtPayload(token);
    const userId = payload?.sub;
    if (!userId) {
      return { error: 'Invalid token or user not found' };
    }

    // 2. Prepare image buffer and file name
    const buffer = file.buffer;
    const mimeType = file.mimetype;
    const fileExt = mimeType.split('/')[1] || 'png';
    const fileName = `profile-images/${userId}_${Date.now()}.${fileExt}`;

    // 3. Upload to Supabase Storage (bucket: 'profile-images')
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('profile-images')
      .upload(fileName, buffer, { contentType: mimeType, upsert: true });
    if (uploadError) {
      return { error: uploadError.message };
    }

    // 4. Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('profile-images')
      .getPublicUrl(fileName);
    const publicUrl = publicUrlData?.publicUrl;
    if (!publicUrl) {
      return { error: 'Failed to get public URL' };
    }

    // 5. Update business profile_picture in DB
    const { error: updateError } = await supabase
      .from('business')
      .update({ profile_picture: publicUrl })
      .eq('supabase_user_id', userId);
    if (updateError) {
      return { error: updateError.message };
    }

    return { url: publicUrl };
  }

  async updateBusiness(req: any, body: any) {
    // 1. Get JWT from Authorization header
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader) {
      return { error: 'No authorization header' };
    }
    const token = authHeader.replace('Bearer ', '');
    try {
      const decoded: any = decodeJwtPayload(token);
      const supabaseUserId = decoded?.sub;
      // 2. Map frontend fields to Supabase columns
      const updateFields: any = {};
      if (body.name) updateFields.business_name = body.name;
      if (body.phone) updateFields.phone = body.phone;
      if (body.email) updateFields.email = body.email;
      if (body.profile_picture) updateFields.profile_picture = body.profile_picture;
      if (body.pickup_address) updateFields.pickup_address = body.pickup_address;
      if (body.pickup_city) updateFields.pickup_city = body.pickup_city;
      if (body.pickup_state) updateFields.pickup_state = body.pickup_state;
      if (body.pickup_contact_number) updateFields.pickup_contact_number = body.pickup_contact_number;
      if (body.pickup_country) updateFields.pickup_country = body.pickup_country;
      if (body.pickup_country_code) updateFields.pickup_country_code = body.pickup_country_code;
      if (body.api_key) updateFields.api_key = body.api_key;
      // Add more fields as needed
      if (Object.keys(updateFields).length === 0) {
        return { error: 'No valid fields to update' };
      }
      // 3. Update allowed fields in Supabase
      const { error: updateError } = await supabase
        .from('business')
        .update(updateFields)
        .eq('supabase_user_id', supabaseUserId);
      if (updateError) {
        return { error: updateError.message };
      }
      // 4. Return updated business profile
      const { data: businessArr } = await supabase
        .from('business')
        .select('*')
        .eq('supabase_user_id', supabaseUserId)
        .limit(1);
      const updatedBusiness = businessArr ? businessArr[0] : null;
      if (updatedBusiness) {
        try {
          await this.businessService.updateBusinessWithGlovoAddressBook(updatedBusiness.id, body);
        } catch (e) {
          console.error('[AuthService] Error updating Glovo address book:', e);
        }
      }
      return { message: 'Business updated', business: updatedBusiness };
    } catch (e) {
      return { error: 'Invalid token' };
    }
  }

  async requestPasswordReset(body: any) {
    const { email } = body;
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: process.env.SUPABASE_PASSWORD_RESET_REDIRECT_URL || undefined,
    });
    if (error) {
      return { error: error.message };
    }
    return { message: 'Password reset email sent. Please check your inbox.' };
  }
}
