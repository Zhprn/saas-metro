import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PaymentModule } from './payment/payment.module';
import { PackageModule } from './package/package.module';
import { CmsModule } from './cms/cms.module';

@Module({
  imports: [
    UserModule,
    DashboardModule,
    PaymentModule,
    PackageModule,
    CmsModule,
  ],
  controllers: [],
  providers: [],
})
export class AdminModule {}
