import { Module } from '@nestjs/common';
import { ClientLogosModule } from './client-logos/client-logos.module';
import { TestimonialsModule } from './testimonials/testimonials.module';

@Module({
  imports: [ClientLogosModule, TestimonialsModule],
})
export class CmsModule {}
