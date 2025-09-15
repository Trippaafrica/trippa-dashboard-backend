import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { LogisticsPartnerService } from './logistics/logistics-partner.service';
import { CreateOrderDto } from './logistics/types';

@Controller('create-order')
export class CreateOrderController {
  constructor(private partnerService: LogisticsPartnerService) {}

  @Post()
  async createOrder(@Body() body: CreateOrderDto) {
    if (!body.partner || !body.partnerId || !body.request) {
      throw new BadRequestException('Missing required fields');
    }
    return this.partnerService.createOrder(body);
  }
}
