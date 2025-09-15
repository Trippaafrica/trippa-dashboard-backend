import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationType } from './notification.entity';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get(':business_id')
  async getNotifications(@Param('business_id') business_id: string) {
    return this.notificationsService.getNotifications(business_id);
  }

  @Post()
  async createNotification(
    @Body() body: { business_id: string; type: NotificationType; message: string }
  ) {
    return this.notificationsService.createNotification(body.business_id, body.type, body.message);
  }

  // PATCH /notifications/:notification_id/read
  @Patch(':notification_id/read')
  async markNotificationAsRead(@Param('notification_id') notification_id: string) {
    return this.notificationsService.markNotificationAsRead(notification_id);
  }

  // PATCH /notifications/:business_id/read-all
  @Patch(':business_id/read-all')
  async markAllNotificationsAsRead(@Param('business_id') business_id: string) {
    return this.notificationsService.markAllNotificationsAsRead(business_id);
  }
}
