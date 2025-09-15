import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { FaramoveWebhookService } from './faramove-webhook.service';

@Controller('faramove/webhook')
export class FaramoveWebhookController {
  constructor(private readonly faramoveWebhookService: FaramoveWebhookService) {}

  @Post('register')
  @HttpCode(200)
  async registerWebhook(@Body() body: { apiUrl: string; apiKey: string; webhookUrl: string }) {
    if (!body.apiUrl || !body.apiKey || !body.webhookUrl) {
      return { error: 'Missing apiUrl, apiKey, or webhookUrl' };
    }
    try {
      const result = await this.faramoveWebhookService.registerWebhook(
        body.apiUrl,
        body.apiKey,
        body.webhookUrl,
      );
      return { success: true, result };
    } catch (error) {
      return { error: error.message };
    }
  }
}
