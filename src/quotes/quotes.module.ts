
import { Module } from '@nestjs/common';
import { QuotesController } from './quotes.controller';
import { LogisticsModule } from '../logistics/logistics.module';
import { GeocodeService } from '../utils/geocode.service';

@Module({
  imports: [LogisticsModule],
  controllers: [QuotesController],
  providers: [GeocodeService],
})
export class QuotesModule {}
