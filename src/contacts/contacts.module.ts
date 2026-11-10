import { forwardRef, Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { WaModule } from 'src/wa/wa.module';

@Module({
  imports: [PrismaModule, forwardRef(() => WaModule)],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
