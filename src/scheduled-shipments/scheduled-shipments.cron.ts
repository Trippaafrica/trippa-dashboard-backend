import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduledShipmentsService } from './scheduled-shipments.service';

@Injectable()
export class ScheduledShipmentsCron {
  private readonly logger = new Logger(ScheduledShipmentsCron.name);

  constructor(private readonly scheduledShipmentsService: ScheduledShipmentsService) {}

  // Runs every minute
  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledShipments() {
    this.logger.log('Checking for due scheduled shipments...');
    const dueShipments = await this.scheduledShipmentsService.getDueScheduledShipments();
    if (!dueShipments.length) {
      this.logger.log('No scheduled shipments due for processing.');
      return;
    }
    for (const shipment of dueShipments) {
      await this.scheduledShipmentsService.processScheduledShipment(shipment);
    }
    this.logger.log(`Processed ${dueShipments.length} scheduled shipments.`);
  }
}
