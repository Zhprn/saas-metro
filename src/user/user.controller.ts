import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto, CreateUserSchema } from './dto/create-user.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { UpdateUserDto, UpdateUserSchema } from './dto/update-user.dto';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard.auth';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { User } from 'src/common/decorators/user.decorator';

const imageFileFilter = (_req, file, cb) => {
  const ok = /^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype);
  cb(ok ? null : new BadRequestException('Only image files allowed'), ok);
};

const storage = diskStorage({
  destination: 'uploads/avatars',
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + extname(file.originalname).toLowerCase());
  },
});

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  register(@Body(new ZodValidationPipe(CreateUserSchema)) dto: CreateUserDto) {
    return this.userService.createUser(dto);
  }

  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('picture', {
      storage,
      fileFilter: imageFileFilter,
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateUserSchema)) updateUserDto: UpdateUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const pictureUrl = file ? `/uploads/avatars/${file.filename}` : undefined;
    if (updateUserDto.telephone?.startsWith('08')) {
      updateUserDto.telephone = '62' + updateUserDto.telephone.slice(1);
    }
    return this.userService.updateUser(id, updateUserDto, pictureUrl);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string) {
    return this.userService.deleteUser(id);
  }

  // @UseGuards(JwtAuthGuard)
  // @Patch('me')
  // @UseInterceptors(FileInterceptor('picture', { storage, fileFilter: imageFileFilter, limits: { fileSize: 2 * 1024 * 1024 } }))
  // async updateUser(
  //   @User() user,
  //   @Body(new ZodValidationPipe(UpdateUserSchema)) dto: UpdateUserDto,
  //   @UploadedFile() file?: Express.Multer.File,
  // ) {
  //   // Build public URL if file exists
  //   const pictureUrl = file ? `/uploads/avatars/${file.filename}` : undefined;
  //   return this.userService.updateUser(user.id, dto, pictureUrl);
  // }
}
