import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  Query,
  UsePipes,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { TestimonialsService } from './testimonials.service';
import { CreateTestimonialDto } from './dto/create-testimonial.dto';
import { UpdateTestimonialDto } from './dto/update-testimonial.dto';
import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { TestimonialStatus } from '@prisma/client';

const avatarFolder = './uploads/avatars';
if (!existsSync(avatarFolder)) {
  mkdirSync(avatarFolder, { recursive: true });
}

const avatarFileFilter = (_req, file, cb) => {
  const ok = /^image\/(png|jpe?g|webp)$/i.test(file.mimetype);
  cb(
    ok
      ? null
      : new BadRequestException(
          'Only image files are allowed (png, jpg, jpeg, webp)',
        ),
    ok,
  );
};

const avatarStorage = diskStorage({
  destination: avatarFolder,
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `avatar-${unique}${extname(file.originalname).toLowerCase()}`);
  },
});

@Controller('admin/testimonials')
@UsePipes(ZodValidationPipe)
export class TestimonialsController {
  constructor(private readonly testimonialsService: TestimonialsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: avatarStorage,
      fileFilter: avatarFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  )
  async create(
    @Body() dto: CreateTestimonialDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) dto.avatarUrl = `/uploads/avatars/${file.filename}`;
    return this.testimonialsService.create(dto);
  }

  @Patch(':id')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: avatarStorage,
      fileFilter: avatarFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTestimonialDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) dto.avatarUrl = `/uploads/avatars/${file.filename}`;

    return this.testimonialsService.update(id, dto);
  }

  @Get()
  findAll() {
    return this.testimonialsService.findAll();
  }

  @Get('stats')
  getStats() {
    return this.testimonialsService.getStats();
  }

  @Get('landing')
  getLanding(
    @Query('limit') limit?: string,
    @Query('minRating') minRating?: string,
  ) {
    return this.testimonialsService.getForLandingPage(
      limit ? parseInt(limit) : 6,
      minRating ? parseInt(minRating) : 4,
    );
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: TestimonialStatus,
  ) {
    return this.testimonialsService.update(id, { status });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.testimonialsService.remove(id);
  }
}
