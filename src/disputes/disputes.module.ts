import { Module, forwardRef } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DisputeService } from './dispute.service';
import { DisputeController } from './dispute.controller';
import { DisputesGateway } from './disputes.gateway';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  providers: [DisputeService, DisputesGateway],
  controllers: [DisputeController],
  exports: [DisputesGateway],
})
export class DisputesModule {}
