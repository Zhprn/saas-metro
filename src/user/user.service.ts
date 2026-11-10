import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcryptjs';
import { UpdateUserDto } from './dto/update-user.dto';
import * as fs from 'fs/promises';
import { join } from 'path';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async createUser(dto: CreateUserDto) {
    const existingUser = await this.findByEmail(dto.email);
    if (existingUser) {
      throw new BadRequestException('Email already in use');
    }

    const password = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password,
        role: dto.role || UserRole.USER,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        telephone: true,
        picture: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async updateUser(id: string, dto: UpdateUserDto, newPictureUrl?: string) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!existingUser) throw new BadRequestException('User not found');

    if (dto.email && dto.email !== existingUser.email) {
      const emailExists = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (emailExists && emailExists.id !== id) {
        throw new ConflictException('Email already in use');
      }
    }

    const updateData = {
      email: dto.email,
      name: dto.name,
      role: dto.role,
      telephone: dto.telephone,
      ...(dto.password && { password: await bcrypt.hash(dto.password, 10) }),
      ...(newPictureUrl && { picture: newPictureUrl }),
    };

    if (
      newPictureUrl &&
      existingUser.picture &&
      existingUser.picture.startsWith('uploads/')
    ) {
      const oldPath = join(process.cwd(), existingUser.picture);
      fs.unlink(oldPath).catch(() => void 0);
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteUser(id: string) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!existingUser) throw new BadRequestException('User not found');
    return this.prisma.user.delete({
      where: { id },
    });
  }
}
