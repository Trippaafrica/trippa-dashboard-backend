import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' }, // Adjust for production
})
export class DisputesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: any) {
    // Optionally authenticate client here
    // console.log('Client connected:', client.id);
  }

  handleDisconnect(client: any) {
    // console.log('Client disconnected:', client.id);
  }

  // Call this method from your service/controller when disputes change
  sendDisputesUpdate(payload: any) {
    this.server.emit('disputes_update', payload);
  }
}
