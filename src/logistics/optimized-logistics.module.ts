import { Module } from '@nestjs/common';
import { OptimizedOrderController } from './optimized-order.controller';

@Module({
  controllers: [OptimizedOrderController]
})
export class OptimizedLogisticsModule {}
