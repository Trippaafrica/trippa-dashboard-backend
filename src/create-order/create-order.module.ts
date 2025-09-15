import { Module } from '@nestjs/common';
import { CreateOrderController } from './create-order.controller';
import { CreateOrderService } from './create-order.service';
import { LogisticsModule } from '../logistics/logistics.module';

@Module({
  imports: [LogisticsModule],
  controllers: [CreateOrderController],
  providers: [CreateOrderService],
  exports: [CreateOrderService],
})
export class CreateOrderModule {}
