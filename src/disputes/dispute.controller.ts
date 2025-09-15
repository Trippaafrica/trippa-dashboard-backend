

import { Controller, Post, Body, Get, Param, Patch, Inject, forwardRef } from '@nestjs/common';
import { DisputeService, Dispute, DisputePriority, DisputeStatus } from './dispute.service';
import { DisputesGateway } from './disputes.gateway';

@Controller('disputes')
export class DisputeController {
  constructor(
    private readonly disputeService: DisputeService,
    @Inject(forwardRef(() => DisputesGateway))
    private readonly disputesGateway: DisputesGateway,
  ) {}
  @Get()
  async getAllDisputes() {
    // TODO: Add admin authentication/authorization here if needed
    const { data, error } = await this.disputeService.getAllDisputes();
    if (error) throw error;
    return data;
  }

  @Post()
  async createDispute(@Body() body: Omit<Dispute, 'id' | 'created_at' | 'updated_at' | 'status' | 'priority'>) {
    return this.disputeService.createDispute(body);
  }

  @Get('order/:order_id')
  async getDisputesByOrder(@Param('order_id') order_id: string) {
    return this.disputeService.getDisputesByOrder(order_id);
  }

  @Patch(':id/status')
  async updateDisputeStatus(@Param('id') id: string, @Body('status') status: DisputeStatus) {
    return this.disputeService.updateDisputeStatus(id, status);
  }

  @Patch(':id/priority')
  async updateDisputePriority(@Param('id') id: string, @Body('priority') priority: DisputePriority) {
    return this.disputeService.updateDisputePriority(id, priority);
  }
}
