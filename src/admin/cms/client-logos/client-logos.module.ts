import { Module } from '@nestjs/common';
import { ClientLogosController } from './client-logos.controller';
import { ClientLogosService } from './client-logos.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ClientLogosController],
  providers: [ClientLogosService],
})
export class ClientLogosModule {}
