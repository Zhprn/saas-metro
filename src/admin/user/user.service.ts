import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { CreateAdminUserDto } from './dto/create-user.dto';
import { UpdateAdminUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  // ==================== ADMIN REGISTER ====================
  async registerAdmin(dto: CreateAdminDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const admin = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: hashedPassword,
        role: UserRole.ADMIN,
        emailVerifiedAt: new Date(),
      },
    });

    return {
      success: true,
      message: 'Admin registered successfully',
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    };
  }

  // ==================== USER MANAGEMENT ====================

  async findAllUsers(query: UserQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const { search, role, status, startDate, endDate, sortBy, sortOrder } =
      query;
    const skip = (page - 1) * limit;
    const now = new Date();

    const where: any = {};

    // Search by name, email, or ID
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Filter by role
    if (role) {
      where.role = role;
    }

    // Filter by date range (sign-up date)
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    // Filter by subscription status
    if (status === 'active') {
      where.subscriptions = {
        some: {
          status: 'ACTIVE',
          endDate: { gte: now },
        },
      };
    } else if (status === 'inactive') {
      where.NOT = {
        subscriptions: {
          some: {
            status: 'ACTIVE',
            endDate: { gte: now },
          },
        },
      };
    }

    // Build orderBy
    let orderBy: any = { createdAt: sortOrder || 'desc' };
    if (sortBy === 'id') {
      orderBy = { id: sortOrder || 'desc' };
    } else if (sortBy === 'email') {
      orderBy = { email: sortOrder || 'asc' };
    } else if (sortBy === 'createdAt') {
      orderBy = { createdAt: sortOrder || 'desc' };
    }
    // planType sorting handled after fetch

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          telephone: true,
          picture: true,
          emailVerifiedAt: true,
          createdAt: true,
          updatedAt: true,
          subscriptions: {
            where: { status: 'ACTIVE', endDate: { gte: now } },
            take: 1,
            orderBy: { endDate: 'desc' },
            select: {
              status: true,
              package: {
                select: { name: true },
              },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Format response sesuai UI
    let formattedData = users.map((user, index) => ({
      no: skip + index + 1,
      idKlien: `#${user.id.slice(-8).toUpperCase()}`,
      name: user.name,
      email: user.email,
      telephone: user.telephone,
      tanggalDaftar: user.createdAt.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
      planType: user.subscriptions[0]?.package?.name || null,
      status: user.subscriptions.length > 0 ? 'Active' : 'Inactive',
    }));

    // Sort by planType if needed (after fetch)
    if (sortBy === 'planType') {
      formattedData = formattedData.sort((a, b) => {
        const aVal = a.planType || '';
        const bVal = b.planType || '';
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      });
    }

    return {
      data: formattedData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findUserById(id: string) {
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        telephone: true,
        picture: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        subscriptions: {
          where: { status: 'ACTIVE', endDate: { gte: now } },
          take: 1,
          orderBy: { endDate: 'desc' },
          select: {
            status: true,
            startDate: true,
            endDate: true,
            package: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Format subscription info
    const activeSubscription = user.subscriptions[0];
    const subscription = activeSubscription
      ? {
          packageName: activeSubscription.package.name,
          status: activeSubscription.status,
          startDate: activeSubscription.startDate.toLocaleDateString('id-ID', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          }),
          endDate: activeSubscription.endDate.toLocaleDateString('id-ID', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          }),
        }
      : null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      telephone: user.telephone,
      picture: user.picture,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      subscription,
    };
  }

  async createUser(dto: CreateAdminUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: hashedPassword,
        role: (dto.role as UserRole) || UserRole.USER,
        telephone: dto.telephone,
        emailVerifiedAt: new Date(),
      },
    });

    return {
      success: true,
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        telephone: user.telephone,
        createdAt: user.createdAt,
      },
    };
  }

  async updateUser(id: string, dto: UpdateAdminUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    if (dto.email && dto.email !== existingUser.email) {
      const emailExists = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (emailExists) {
        throw new ConflictException('Email already in use');
      }
    }

    const updateData: any = {
      name: dto.name,
      email: dto.email,
      telephone: dto.telephone,
      role: dto.role as UserRole,
    };

    if (dto.password) {
      updateData.password = await bcrypt.hash(dto.password, 10);
    }

    // Remove undefined values
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        telephone: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      message: 'User updated successfully',
      user,
    };
  }

  async deleteUser(id: string) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'User deleted successfully',
    };
  }
}
