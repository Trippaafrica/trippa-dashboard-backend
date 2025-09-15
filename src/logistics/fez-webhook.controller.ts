import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { supabase } from '../auth/supabase.client';

@Controller('fez/webhook')
export class FezWebhookController {
  @Post()
  @HttpCode(200)
  async handleWebhook(@Body() body: { orderNumber: string; status: string }) {
    if (!body.orderNumber || !body.status) {
      return { error: 'Missing orderNumber or status' };
    }
    // Update the order status in your DB
    const { error } = await supabase
      .from('order')
      .update({ status: body.status })
      .eq('partner_response->>orderId', body.orderNumber)
      .select();
    if (error) {
      return { error: error.message };
    }
    return { success: true };
  }
}
