import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { UserService } from './user.service';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CreateAdminDto, CreateAdminSchema } from './dto/create-admin.dto';
import { CreateAdminUserDto, CreateUserSchema } from './dto/create-user.dto';
import { UpdateAdminUserDto, UpdateUserSchema } from './dto/update-user.dto';
import { UserQueryDto, UserQuerySchema } from './dto/user-query.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard.auth';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UserController {
  constructor(private readonly userService: UserService) {}

  // ==================== ADMIN REGISTER ====================
  @Post('register')
  async registerAdmin(
    @Body(new ZodValidationPipe(CreateAdminSchema)) dto: CreateAdminDto,
  ) {
    return this.userService.registerAdmin(dto);
  }

  // ==================== USER MANAGEMENT ====================
  @Get('users')
  async findAllUsers(
    @Query(new ZodValidationPipe(UserQuerySchema)) query: UserQueryDto,
  ) {
    return this.userService.findAllUsers(query);
  }

  @Get('users/:id')
  async findUserById(@Param('id') id: string) {
    return this.userService.findUserById(id);
  }

  @Post('users')
  async createUser(
    @Body(new ZodValidationPipe(CreateUserSchema)) dto: CreateAdminUserDto,
  ) {
    return this.userService.createUser(dto);
  }

  @Patch('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateUserSchema)) dto: UpdateAdminUserDto,
  ) {
    return this.userService.updateUser(id, dto);
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    return this.userService.deleteUser(id);
  }
}
