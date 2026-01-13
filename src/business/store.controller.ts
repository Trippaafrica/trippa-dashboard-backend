import { Controller, Get, Post, Body, BadRequestException, Req } from '@nestjs/common';
import { supabase } from '../auth/supabase.client';

// Bearer apiKey store-facing controller
// GET /api/v1/store/info
// POST /api/v1/store/settings
@Controller('store')
export class StoreController {
  private async resolveBusinessId(req: any): Promise<string> {
    const authHeader = req.headers['authorization'];
    const apiKeyHeader = req.headers['x-api-key'];
    const shopdomain = req.headers['shopdomain'];

    if (authHeader && String(authHeader).startsWith('Bearer ')) {
      const token = String(authHeader).replace('Bearer ', '');
      const { data: byKey } = await supabase
        .from('business')
        .select('id')
        .eq('api_key', token)
        .single();
      if (byKey?.id) return byKey.id;
    }

    if (apiKeyHeader) {
      const { data: byKey, error } = await supabase
        .from('business')
        .select('id')
        .eq('api_key', apiKeyHeader)
        .single();
      if (error || !byKey?.id) throw new BadRequestException('Invalid API key');
      return byKey.id;
    }

    if (shopdomain) {
      const { data: byShop, error } = await supabase
        .from('business')
        .select('id')
        .eq('shopdomain', shopdomain)
        .single();
      if (error || !byShop?.id) throw new BadRequestException('Invalid shopdomain');
      return byShop.id;
    }

    throw new BadRequestException('Missing authentication: provide Authorization Bearer <apiKey>, x-api-key, or shopdomain');
  }

  @Get('info')
  async getInfo(@Req() req: any) {
    const businessId = await this.resolveBusinessId(req);
    const { data: biz, error } = await supabase
      .from('business')
      .select('id, business_name, email, phone, shopdomain, type, webhook_url, wallet_balance, created_at, updated_at')
      .eq('id', businessId)
      .single();
    if (error || !biz) throw new BadRequestException('Business not found');
    return {
      businessId: biz.id,
      business_name: biz.business_name,
      email: biz.email,
      phone: biz.phone,
      shopdomain: biz.shopdomain,
      type: biz.type,
      webhook_url: biz.webhook_url,
      wallet_balance: Number(biz.wallet_balance || 0) / 100,
      created_at: biz.created_at,
      updated_at: biz.updated_at,
    };
  }

  @Post('settings')
  async updateSettings(@Req() req: any, @Body() body: any) {
    const businessId = await this.resolveBusinessId(req);

    // Allowlist of updatable fields
    const allowed: any = {};
    if (typeof body.business_name === 'string') allowed.business_name = body.business_name;
    if (typeof body.phone === 'string') allowed.phone = body.phone;
    if (typeof body.webhookUrl === 'string') allowed.webhook_url = body.webhookUrl;
    // pickupAddress could be stored across specific columns; if provided as string, store in a generic column if you have it
    // For now we skip unless schema supports it.

    if (Object.keys(allowed).length === 0) {
      throw new BadRequestException('No valid settings provided');
    }

    allowed.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('business')
      .update(allowed)
      .eq('id', businessId)
      .select('id, business_name, phone, webhook_url, updated_at')
      .single();
    if (error) throw new BadRequestException('Failed to update settings');
    return { success: true, businessId: data.id, updated: data };
  }
}
