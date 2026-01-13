import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ProviderWebhookController } from './provider-webhook.controller';
import { ProviderWebhookService } from './provider-webhook.service';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { TableUpdatesGateway } from '../gateways/table-updates.gateway';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    DatabaseModule,
    NotificationsModule,
  ],
  controllers: [ProviderWebhookController],
  providers: [
    ProviderWebhookService,
    NotificationsGateway,
    TableUpdatesGateway,
  ],
  exports: [ProviderWebhookService],
})
export class ProviderWebhookModule {}
