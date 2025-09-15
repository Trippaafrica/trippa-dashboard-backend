

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WalletModule } from './wallet.module';
import { BusinessController } from './business.controller';
import { BusinessAnalyticsController } from './business-analytics.controller';
import { BusinessService } from './business.service';
import { GlovoAddressBookService } from '../logistics/adapters/glovo.addressbook';
import { GeocodeService } from '../utils/geocode.service';

@Module({
  imports: [HttpModule, WalletModule],
  controllers: [BusinessController, BusinessAnalyticsController],
  providers: [BusinessService, GlovoAddressBookService, GeocodeService],
  exports: [BusinessService, GlovoAddressBookService],
})
export class BusinessModule {}
