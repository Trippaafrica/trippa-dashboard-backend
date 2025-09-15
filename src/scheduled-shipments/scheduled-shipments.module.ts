import { Module } from '@nestjs/common';
import { ScheduledShipmentsController } from './scheduled-shipments.controller';
import { ScheduledShipmentsService } from './scheduled-shipments.service';
import { ScheduledShipmentsCron } from './scheduled-shipments.cron';
import { CreateOrderModule } from '../create-order/create-order.module';
import { BusinessModule } from '../business/business.module';
import { WalletModule } from '../business/wallet.module';

@Module({
  imports: [CreateOrderModule, BusinessModule, WalletModule],
  controllers: [ScheduledShipmentsController],
  providers: [ScheduledShipmentsService, ScheduledShipmentsCron],
  exports: [ScheduledShipmentsService],
})
export class ScheduledShipmentsModule {}
