import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { DisputesGateway } from './disputes.gateway';
import { supabase } from '../auth/supabase.client';

export type DisputeStatus = 'open' | 'closed';
export type DisputePriority = 'medium' | 'high';

export interface Dispute {
  id: string;
  business_id: string;
  order_id: string; // UUID referencing order.id
  type: string;
  description: string;
  status: DisputeStatus;
  priority: DisputePriority;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class DisputeService {
  constructor(
    @Inject(forwardRef(() => DisputesGateway))
    private readonly disputesGateway: DisputesGateway,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}
  async getAllDisputes(): Promise<{ data: Dispute[] | null; error: any }> {
    const { data, error } = await supabase
      .from('disputes')
      .select('*');
    return { data, error };
  }
  async createDispute(data: Omit<Dispute, 'id' | 'created_at' | 'updated_at' | 'status' | 'priority' | 'business_id'>): Promise<Dispute | null> {
    // Fetch the order to get the business_id
    const { data: order, error: orderError } = await supabase
      .from('order')
      .select('business_id')
      .eq('id', data.order_id)
      .single();
    if (orderError || !order?.business_id) {
      throw new Error('Could not find order or business_id for dispute creation');
    }
    const { data: dispute, error } = await supabase
      .from('disputes')
      .insert({
        ...data,
        business_id: order.business_id,
        status: 'open',
        priority: 'medium',
      })
      .select()
      .single();
    if (error) throw error;
    // Emit update after creation
    const { data: allDisputes } = await this.getAllDisputes();
    console.log('[DisputeService] Emitting disputes_update after create:', (allDisputes || []).length, 'disputes');
    this.disputesGateway.sendDisputesUpdate({ items: allDisputes || [] });
    return dispute;
  }

  // order_id here is the UUID referencing order.id
  async getDisputesByOrder(order_id: string): Promise<Dispute[]> {
    const { data, error } = await supabase
      .from('disputes')
      .select('*')
      .eq('order_id', order_id); // order_id is now UUID
    if (error) throw error;
    return data || [];
  }

  async updateDisputeStatus(id: string, status: DisputeStatus): Promise<Dispute | null> {
    const { data, error } = await supabase
      .from('disputes')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    // Emit update after status change
    const { data: allDisputes } = await this.getAllDisputes();
    console.log('[DisputeService] Emitting disputes_update after status update:', (allDisputes || []).length, 'disputes');
    this.disputesGateway.sendDisputesUpdate({ items: allDisputes || [] });
    // Send notification if dispute is resolved (status changed to closed)
    if (data && status === 'closed') {
      await this.notificationsService.createNotification(
        data.business_id,
        'dispute_resolved',
        'A dispute has been resolved.'
      );
    }
    return data;
  }

  async updateDisputePriority(id: string, priority: DisputePriority): Promise<Dispute | null> {
    const { data, error } = await supabase
      .from('disputes')
      .update({ priority })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    // Emit update after priority change
    const { data: allDisputes } = await this.getAllDisputes();
    console.log('[DisputeService] Emitting disputes_update after priority update:', (allDisputes || []).length, 'disputes');
    this.disputesGateway.sendDisputesUpdate({ items: allDisputes || [] });
    return data;
  }
}
