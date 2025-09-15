import { Controller, Get, Patch, Param, Body, Post } from '@nestjs/common';
import { CreateOrderDto } from './types';
import { LogisticsPartnerService } from './logistics-partner.service';

@Controller('logistics/partners')
export class LogisticsPartnerController {
  constructor(private readonly partnerService: LogisticsPartnerService) {}

  @Get('summary')
  async getPartnersSummary() {
    return this.partnerService.getPartnersSummary();
  }

  @Patch(':id/status')
  async setPartnerStatus(
    @Param('id') id: number,
    @Body('isActive') isActive: boolean
  ) {
    return this.partnerService.setPartnerStatus(id, isActive);
  }
}
