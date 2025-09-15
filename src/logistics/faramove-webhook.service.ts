import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class FaramoveWebhookService {
  constructor(private readonly httpService: HttpService) {}

  async registerWebhook(apiUrl: string, apiKey: string, webhookUrl: string) {
    const url = `${apiUrl}/api/v2/auth/save-webhook-url`;
    const headers = { 'api-key': apiKey };
    const data = { webhook_url: webhookUrl };
    const response = await this.httpService.post(url, data, { headers }).toPromise();
    return response.data;
  }
}
