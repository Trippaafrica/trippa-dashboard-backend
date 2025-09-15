import { Module } from '@nestjs/common';
import { ShopifyAuthController } from './shopify-auth.controller';
import { ShopifyAuthService } from './shopify-auth.service';

@Module({
  controllers: [ShopifyAuthController],
  providers: [ShopifyAuthService],
})
export class ShopifyAuthModule {}
