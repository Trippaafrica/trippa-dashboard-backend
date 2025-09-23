import { Controller, Post, Body, BadRequestException, Req } from '@nestjs/common';
import { CreateOrderService } from './create-order.service';
import { CreateOrderDto } from '../logistics/types';
import { supabase } from '../auth/supabase.client';

@Controller('create-order')
export class CreateOrderController {
  constructor(private createOrderService: CreateOrderService) {}

  @Post()
  async createOrder(@Body() body: CreateOrderDto, @Req() req) {
    if (!body.partner || !body.request) {
      throw new BadRequestException('Missing required fields: partner and request');
    }
    
    // Validate that we have partnerId (unified field)
    if (!body.partnerId) {
      throw new BadRequestException('partnerId is required for order creation');
    }
    // Unified business lookup: shopdomain (header only), API key, or JWT
    let businessId: string | undefined;
    const apiKey = req.headers['x-api-key'];
    const authHeader = req.headers['authorization'];
    const shopdomain = req.headers['shopdomain'];

    if (shopdomain) {
      // Shopify integration: lookup business by shopdomain (header only)
      const { data: business, error } = await supabase
        .from('business')
        .select('id')
        .eq('shopdomain', shopdomain)
        .single();
      if (error || !business?.id) {
        throw new BadRequestException('Invalid shopdomain or business not found');
      }
      businessId = business.id;
    } else if (apiKey) {
      // API key integration: lookup business by api_key
      const { data: business, error } = await supabase
        .from('business')
        .select('id')
        .eq('api_key', apiKey)
        .single();
      if (error || !business?.id) {
        throw new BadRequestException('Invalid API key or business not found');
      }
      businessId = business.id;
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      // Dashboard user: lookup business by supabase_user_id from token
      const token = authHeader.replace('Bearer ', '');
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userError || !userData?.user?.id) {
        throw new BadRequestException('Invalid or expired token');
      }
      const supabaseUserId = userData.user.id;
      const { data: business, error } = await supabase
        .from('business')
        .select('id')
        .eq('supabase_user_id', supabaseUserId)
        .single();
      if (error || !business?.id) {
        throw new BadRequestException('Business not found for authenticated user');
      }
      businessId = business.id;
    } else {
      throw new BadRequestException('Missing authentication: provide shopdomain (header), x-api-key, or Bearer token');
    }
    return this.createOrderService.createOrder(body, businessId);
  }
}
