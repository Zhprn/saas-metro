import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { ClientLogosService } from './client-logos.service';
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard.auth';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

// Ensure uploads directory exists
const logoFolder = './uploads/client-logos';
if (!existsSync(logoFolder)) {
  mkdirSync(logoFolder, { recursive: true });
}

const imageFileFilter = (_req, file, cb) => {
  const ok = /^image\/(png|jpe?g|webp|gif|svg\+xml)$/i.test(file.mimetype);
  cb(ok ? null : new BadRequestException('Only image files allowed'), ok);
};

const logoStorage = diskStorage({
  destination: logoFolder,
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + extname(file.originalname).toLowerCase());
  },
});

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ClientLogosController {
  constructor(private readonly logosService: ClientLogosService) {}

  // ==================== CLIENT LOGO ====================

  @Get('client-logos')
  async findAllClientLogos() {
    return this.logosService.findAllClientLogos();
  }

  @Get('client-logos/:id')
  async findClientLogoById(@Param('id') id: string) {
    return this.logosService.findClientLogoById(id);
  }

  @Post('client-logos')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: logoStorage,
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  )
  async createClientLogo(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    const imageUrl = `/uploads/client-logos/${file.filename}`;
    return this.logosService.createClientLogo(imageUrl);
  }

  @Patch('client-logos/:id')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: logoStorage,
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async updateClientLogo(
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    const imageUrl = `/uploads/client-logos/${file.filename}`;
    return this.logosService.updateClientLogo(id, imageUrl);
  }

  @Delete('client-logos/:id')
  async deleteClientLogo(@Param('id') id: string) {
    return this.logosService.deleteClientLogo(id);
  }
}
