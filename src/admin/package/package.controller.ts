import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PackageService } from './package.service';
import {
  CreatePackageDto,
  CreatePackageSchema,
  UpdatePackageDto,
  UpdatePackageSchema,
} from './dto/package.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard.auth';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class PackageController {
  constructor(private readonly packageService: PackageService) {}
  // ==================== PACKAGE ====================
  @Get('packages')
  async findAllPackages() {
    return this.packageService.findAllPackages();
  }

  @Get('packages/:id')
  async findPackageById(@Param('id') id: string) {
    return this.packageService.findPackageById(id);
  }

  @Post('packages')
  async createPackage(
    @Body(new ZodValidationPipe(CreatePackageSchema)) dto: CreatePackageDto,
  ) {
    return this.packageService.createPackage(dto);
  }

  @Patch('packages/:id')
  async updatePackage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePackageSchema)) dto: UpdatePackageDto,
  ) {
    return this.packageService.updatePackage(id, dto);
  }

  @Delete('packages/:id')
  async deletePackage(@Param('id') id: string) {
    return this.packageService.deletePackage(id);
  }
}
