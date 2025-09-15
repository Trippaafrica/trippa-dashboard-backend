import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: true })
export class WalletGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  async handleConnection(client: Socket) {
    // Optionally authenticate here
  }

  async handleDisconnect(client: Socket) {
    // Cleanup if needed
  }

  @SubscribeMessage('join')
  handleJoin(@MessageBody() userId: string, @ConnectedSocket() client: Socket) {
    client.join(userId);
  }

  sendWalletUpdate(userId: string, newBalance: number) {
    this.server.to(userId).emit('walletUpdate', { balance: newBalance });
  }
}
