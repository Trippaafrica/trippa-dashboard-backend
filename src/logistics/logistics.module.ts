import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WalletModule } from '../business/wallet.module';
import { LogisticsAggregatorService } from './aggregator.service';
import { LogisticsPartnerService } from './logistics-partner.service';
import { LogisticsPartnerController } from './logistics-partner.controller';
import { FaramoveAdapter } from './adapters/faramove.adapter';
import { FezAdapter } from './adapters/fez.adapter';
import { GlovoAdapter } from './adapters/glovo.adapter';
import { GigAdapter } from './adapters/gig.adapter';
import { FaramoveDataService } from './cache/faramove-data.service';
import { FaramoveDataController } from './faramove-data.controller';
import { FezStatusSyncService } from './fez-status-sync.service';
import { FezStatusSyncController } from './fez-status-sync.controller';
import { FezWebhookController } from './fez-webhook.controller';
import { FaramoveWebhookController } from './faramove-webhook.controller';
import { FaramoveWebhookService } from './faramove-webhook.service';
import { GeocodeService } from '../utils/geocode.service';
import { ProviderRateLimiterService } from '../utils/provider-rate-limiter.service';
import { OrderController } from './order.controller';
import { DhlAdapter } from './adapters/dhl/dhl.adapter';
import { TrackController } from './track.controller';
import { TrackingWebhookController } from './tracking-webhook.controller';
import { OrderService } from './order.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { GitInsuranceService } from './git-insurance.service';
import { TableUpdatesGateway } from '../gateways/table-updates.gateway';
import { GlovoAddressBookService } from './adapters/glovo.addressbook';

@Module({
  imports: [
    HttpModule,
    WalletModule,
    NotificationsModule
  ],
  providers: [
    LogisticsAggregatorService,
    LogisticsPartnerService,
    FaramoveAdapter,
    FezAdapter,
    GlovoAdapter,
    GigAdapter,
    DhlAdapter,
    FaramoveDataService,
  FezStatusSyncService,
    GeocodeService,
    ProviderRateLimiterService,
    GitInsuranceService,
    OrderService,
  TableUpdatesGateway,
  FaramoveWebhookService,
  GlovoAddressBookService
  ],
  controllers: [LogisticsPartnerController, FezStatusSyncController, FezWebhookController, OrderController, TrackController, TrackingWebhookController, FaramoveDataController, FaramoveWebhookController],
  exports: [
    LogisticsAggregatorService,
    LogisticsPartnerService,
    FaramoveAdapter,
    FezAdapter,
    GlovoAdapter,
    GigAdapter,
    DhlAdapter,
    GeocodeService,
    ProviderRateLimiterService,
    GitInsuranceService,
    OrderService,
    FezStatusSyncService,
    GlovoAddressBookService
  ]
})
export class LogisticsModule {}
