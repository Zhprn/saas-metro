import { Module } from '@nestjs/common';
import { WaController } from './wa.controller';
import { WaService } from './wa.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { WaGateway } from './wa.gateway';
import { CloudinaryService } from 'src/common/services/cloudinary.service';
import { AiModule } from 'src/ai/ai.module';
import { CryptoService } from 'src/common/services/crypto.service';
import { WaScheduler } from './wa.scheduler';

@Module({
  controllers: [WaController],
  providers: [
    WaService,
    WaGateway,
    CloudinaryService,
    CryptoService,
    WaScheduler,
  ],
  imports: [PrismaModule, AiModule],
  exports: [WaService],
})
export class WaModule {}
