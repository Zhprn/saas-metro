import { Module } from '@nestjs/common';
import { PackageController } from './package.controller';
import { PackageService } from './package.service';
import { PackageListController } from './package-list/package-list.controller';
import { PackageListService } from './package-list/package-list.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PackageController, PackageListController],
  providers: [PackageService, PackageListService],
  exports: [PackageService, PackageListService],
})
export class PackageModule {}
