import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ cors: true })
export class TableUpdatesGateway {
  @WebSocketServer()
  server: Server;

  // Broadcast table update to all connected clients
  broadcastTableUpdate(tableName: string, data: any) {
    this.server.emit('tableUpdate', { tableName, data });
  }
}
