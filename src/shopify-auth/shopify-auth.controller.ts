import { Controller, Post, Body } from '@nestjs/common';
import { ShopifyAuthService } from './shopify-auth.service';

@Controller('shopify-auth')
export class ShopifyAuthController {
  constructor(private readonly shopifyAuthService: ShopifyAuthService) {}

  @Post('callback')
  async shopifyCallback(@Body() body: any) {
    // body should contain: shopify_access_token, business_name, email, phone
    return await this.shopifyAuthService.handleShopifyCallback(body);
  }
}
