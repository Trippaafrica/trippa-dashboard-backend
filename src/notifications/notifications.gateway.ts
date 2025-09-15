import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: true })
export class NotificationsGateway {
  @WebSocketServer()
  server: Server;

  sendNotification(businessId: string, notification: any) {
    this.server.to(businessId).emit('notification', notification);
  }

  // Allow clients to join a room for their business_id
  @SubscribeMessage('join')
  handleJoin(@MessageBody() businessId: string, @ConnectedSocket() client: Socket) {
    client.join(businessId);
  }

    // Emit order status update to a specific order or business
    sendOrderStatusUpdate(orderId: string, status: string) {
      this.server.emit(`order-status-${orderId}`, { orderId, status });
    }
}
