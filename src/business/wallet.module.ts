import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { PaystackWebhookController } from './paystack-webhook.controller';
import { WalletGateway } from './wallet.gateway';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [HttpModule, forwardRef(() => NotificationsModule)],
  providers: [WalletService, WalletGateway],
  controllers: [WalletController, PaystackWebhookController],
  exports: [WalletService],
})
export class WalletModule {}
