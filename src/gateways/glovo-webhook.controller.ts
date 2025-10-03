import { Controller, Post, Body, Req } from '@nestjs/common';
import { GlovoWebhookService } from './glovo-webhook.service';

@Controller('glovo/webhook')
export class GlovoWebhookController {
  constructor(private readonly glovoWebhookService: GlovoWebhookService) {}

  // Endpoint to receive status updates from Glovo
  @Post('status-update')
  async handleStatusUpdate(@Body() body: any, @Req() req: any) {
    // You can add signature verification here if needed
    return this.glovoWebhookService.processStatusUpdate(body);
  }

  // Endpoint to register webhook with Glovo
  @Post('register')
  async registerWebhook(@Body() body: { callbackUrl: string; partnerSecret: string }) {
    return this.glovoWebhookService.registerWebhook(body.callbackUrl, body.partnerSecret);
  }
}
