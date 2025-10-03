import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GlovoWebhookController } from './glovo-webhook.controller';
import { GlovoWebhookService } from './glovo-webhook.service';

@Module({
  imports: [HttpModule],
  controllers: [GlovoWebhookController],
  providers: [GlovoWebhookService],
})
export class GlovoWebhookModule {}
