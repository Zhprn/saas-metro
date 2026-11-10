import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { PackageListService } from './package-list.service';
import { CreatePackageListDto } from '../dto/package-list.dto';
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard.auth';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('admin/package-lists')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class PackageListController {
  constructor(private readonly packageListService: PackageListService) {}

  @Post()
  async create(@Body() data: CreatePackageListDto) {
    return this.packageListService.create(data);
  }

  @Get()
  async findAll() {
    return this.packageListService.findAll();
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.packageListService.delete(id);
  }
}
