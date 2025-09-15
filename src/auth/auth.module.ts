import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminService } from './admin.service';
import { BusinessModule } from '../business/business.module';
import { WalletModule } from '../business/wallet.module';
import { BusinessService } from '../business/business.service';

@Module({
  imports: [BusinessModule, WalletModule],
  controllers: [AuthController],
  providers: [AuthService, AdminService, BusinessService],
})
export class AuthModule {}
