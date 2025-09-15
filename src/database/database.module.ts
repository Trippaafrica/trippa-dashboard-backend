import { Module, Global } from '@nestjs/common';
import { DatabaseConnectionService } from './database-connection.service';
import { CacheService } from './cache.service';
import { QueryOptimizerService } from './query-optimizer.service';
import { OrderRepository } from './repositories/order.repository';
import { BusinessRepository } from './repositories/business.repository';
import { DatabasePerformanceMonitor } from './database-performance.service';

@Global()
@Module({
  providers: [
    DatabaseConnectionService,
    CacheService,
    QueryOptimizerService,
    OrderRepository,
    BusinessRepository,
    DatabasePerformanceMonitor
  ],
  exports: [
    DatabaseConnectionService,
    CacheService,
    QueryOptimizerService,
    OrderRepository,
    BusinessRepository,
    DatabasePerformanceMonitor
  ]
})
export class DatabaseModule {}
