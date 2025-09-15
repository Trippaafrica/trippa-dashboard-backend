import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';
import { supabase } from '../auth/supabase.client';
import { Notification, NotificationType } from './notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NotificationsGateway)
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async createNotification(business_id: string, type: NotificationType, message: string): Promise<Notification | null> {
    // Check if notifications are enabled for this business
    const { data: business, error: businessError } = await supabase
      .from('business')
      .select('notifications_enabled')
      .eq('id', business_id)
      .single();
    if (businessError) throw businessError;
    if (!business?.notifications_enabled) {
      // Notifications are disabled for this business
      return null;
    }
    const { data, error } = await supabase
      .from('notifications')
      .insert([{ business_id, type, message }])
      .select()
      .single();
    if (error) throw error;
    if (data) {
      this.notificationsGateway.sendNotification(business_id, data);
    }
    return data;
  }

  async getNotifications(business_id: string): Promise<Notification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('business_id', business_id)
      .eq('is_read', false)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async markNotificationAsRead(notification_id: string): Promise<{ success: boolean }> {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notification_id);
    if (error) throw error;
    return { success: true };
  }

  async markAllNotificationsAsRead(business_id: string): Promise<{ success: boolean }> {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('business_id', business_id)
      .eq('is_read', false);
    if (error) throw error;
    return { success: true };
  }
}
