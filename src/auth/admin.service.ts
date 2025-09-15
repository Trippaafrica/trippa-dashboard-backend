// ...existing code...
import { Injectable } from '@nestjs/common';
import { supabase } from './supabase.client';
import { AdminUser } from './admin.entity';

@Injectable()
export class AdminService {
  async createAdminUser(body: any) {
    const { email, password, role = 'admin' } = body;
    // 1. Register with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) {
      return { error: error.message };
    }
    // 2. Insert admin record in Supabase public.admin table
    const adminData: Partial<AdminUser> = {
      email,
      supabase_user_id: data.user?.id || null,
      role,
    };
    const { error: insertError } = await supabase
      .from('admin')
      .upsert([adminData], { onConflict: 'email' });
    if (insertError) {
      return { error: insertError.message };
    }
    return { message: 'Admin user created. Please check your email for confirmation link.' };
  }

  async loginAdmin(body: any) {
    const { email, password } = body;
    // 1. Authenticate with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return { error: error.message };
    }
    const userId = data.user?.id;
    // 2. Check if user is in admin table
    const { data: adminArr, error: adminError } = await supabase
      .from('admin')
      .select('*')
      .eq('email', email)
      .limit(1);
    if (adminError) {
      return { error: adminError.message };
    }
    if (!adminArr || adminArr.length === 0) {
      return { error: 'Not an admin user' };
    }
    let admin = adminArr[0];
    // 3. If supabase_user_id is missing or different, update it
    if (!admin.supabase_user_id || admin.supabase_user_id !== userId) {
      await supabase
        .from('admin')
        .update({ supabase_user_id: userId })
        .eq('id', admin.id);
      admin = { ...admin, supabase_user_id: userId };
    }
    // 4. Return access token and admin info
    return {
      access_token: data.session?.access_token,
      admin,
    };
  }
  // Get admin profile by access token
  async getAdminProfileByToken(token: string) {
    // 1. Validate token with Supabase
    const { data: userData, error } = await supabase.auth.getUser(token);
    if (error || !userData?.user) {
      return { error: 'Invalid or expired token' };
    }
    // 2. Find admin by supabase_user_id
    const { data: adminArr, error: adminError } = await supabase
      .from('admin')
      .select('*')
      .eq('supabase_user_id', userData.user.id)
      .limit(1);
    if (adminError) {
      return { error: adminError.message };
    }
    if (!adminArr || adminArr.length === 0) {
      return { error: 'Not an admin user' };
    }
    // Always return id as admin.id (int), not supabase_user_id
    const admin = adminArr[0];
    return {
      ...admin,
      id: admin.id, // int from admin table
      supabase_user_id: admin.supabase_user_id, // keep for reference
    };
  }
}
