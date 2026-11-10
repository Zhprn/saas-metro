import { Module } from '@nestjs/common';
import { TestimonialsService } from './testimonials.service';
import { TestimonialsController } from './testimonials.controller';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [TestimonialsController],
  providers: [TestimonialsService, PrismaService],
  exports: [TestimonialsService],
})
export class TestimonialsModule {}
