import { Injectable } from '@nestjs/common';
import { LogisticsPartnerService } from '../logistics/logistics-partner.service';
import { CreateOrderDto } from '../logistics/types';

@Injectable()
export class CreateOrderService {
  constructor(public partnerService: LogisticsPartnerService) {}

  async createOrder(body: CreateOrderDto, businessId?: string, skipWalletDebit?: boolean) {
    return this.partnerService.createOrder(body, businessId, skipWalletDebit);
  }
}
