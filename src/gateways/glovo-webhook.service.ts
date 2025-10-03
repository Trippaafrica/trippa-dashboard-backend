import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Inject } from '@nestjs/common';
import { OrderRepository } from '../database/repositories/order.repository';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class GlovoWebhookService {
  constructor(
    private readonly httpService: HttpService,
    @Inject(OrderRepository) private readonly orderRepository: OrderRepository
  ) {}

  async processStatusUpdate(data: any) {
    // Glovo payload example: { orderId, status, ... }
    const { orderId, status } = data;
    if (!orderId || !status) {
      return { success: false, error: 'Missing orderId or status in payload' };
    }
    // Find order by partner_response.orderId and update status
    try {
      const order = await this.orderRepository.findMany({
        where: { 'partner_response->orderId': orderId },
        limit: 1
      });
      if (!order.data || order.data.length === 0) {
        return { success: false, error: 'Order not found' };
      }
      const orderRecord = order.data[0];
      await this.orderRepository.update(orderRecord.id, {
        status,
        updated_at: new Date().toISOString(),
      });
      return { success: true };
    } catch (error) {
      console.error('Error updating order status:', error);
      return { success: false, error: error.message };
    }
  }

  async registerWebhook(callbackUrl: string, partnerSecret: string) {
    const payload = {
      callbackUrl,
      eventType: 'STATUS_UPDATE',
      partnerSecret,
      retryConfig: { maxRetryCount: 1 },
    };
    // If partnerSecret is provided, send as Authorization header in callback registration
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (partnerSecret) {
      headers['Authorization'] = partnerSecret;
    }
    const url = 'https://api.glovoapp.com/v2/laas/webhooks';
    try {
      const response = await firstValueFrom(
        this.httpService.post(url, payload, { headers })
      );
      return response.data;
    } catch (error) {
      console.error('Glovo webhook registration failed:', error);
      throw error;
    }
  }
}
