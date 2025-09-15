import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { FezStatusSyncService } from './fez-status-sync.service';

@Controller('fez-status-sync')
export class FezStatusSyncController {
  constructor(private readonly fezStatusSyncService: FezStatusSyncService) {}

  // Manually trigger a status sync for a specific Fez order
  @Post('sync')
  async syncStatus(@Body('fezOrderId') fezOrderId: string) {
    const status = await this.fezStatusSyncService.syncFezOrderStatus(fezOrderId);
    return { fezOrderId, status };
  }

  // Optionally, trigger by local order id if you want
  @Get('sync-by-local')
  async syncByLocalOrder(@Query('localOrderId') localOrderId: string) {
    // You'd need to look up the Fez orderId from your DB using the local orderId
    // For now, just a placeholder
    return { message: 'Not implemented' };
  }
}
