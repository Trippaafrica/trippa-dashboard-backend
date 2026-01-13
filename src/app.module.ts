import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { QuotesModule } from './quotes/quotes.module';
import { BusinessModule } from './business/business.module';
import { DisputesModule } from './disputes/disputes.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CreateOrderModule } from './create-order/create-order.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { ScheduledShipmentsModule } from './scheduled-shipments/scheduled-shipments.module';
import { LoggerModule } from './utils/logger.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';

import { ShopifyAuthModule } from './shopify-auth/shopify-auth.module';
import { ProviderWebhookModule } from './shopify-webhook/provider-webhook.module';

import { GlovoWebhookModule } from './gateways/glovo-webhook.module';

import { ApiStatsService } from './utils/api-stats.service';
import { ApiStatsController } from './utils/api-stats.controller';
import { ProviderRateLimiterService } from './utils/provider-rate-limiter.service';
import { RateLimiterController } from './utils/rate-limiter.controller';
import { TableUpdatesGateway } from './gateways/table-updates.gateway';
import { LogisticsModule } from './logistics/logistics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          limit: 300,
          ttl: 60,
          // 300 requests per 60 seconds per IP
        },
      ],
    }),
    DatabaseModule, // Add database optimization module
    LoggerModule,
    AuthModule,
    QuotesModule,
    BusinessModule,
    DisputesModule,
    CreateOrderModule,
    DeliveriesModule,
    ScheduledShipmentsModule,
    NotificationsModule,
    HealthModule,
    ShopifyAuthModule,
    ProviderWebhookModule,
    GlovoWebhookModule,
    LogisticsModule,
  ],
  controllers: [ApiStatsController, RateLimiterController],
  providers: [ApiStatsService, ProviderRateLimiterService, TableUpdatesGateway],
})
export class AppModule {}
