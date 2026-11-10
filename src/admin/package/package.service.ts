import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PackageService {
  constructor(private prisma: PrismaService) {}

  // ==================== PACKAGE ====================

  async findAllPackages() {
    const packages = await this.prisma.package.findMany({
      include: {
        packageLists: true,
        _count: {
          select: {
            subscriptions: {
              where: { status: 'ACTIVE' },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedData = packages.map((pkg) => {
      const { _count, packageLists, ...rest } = pkg;

      return {
        ...rest,
        activeUsers: _count.subscriptions,
        features: packageLists.map((f) => f.name),
      };
    });

    return {
      success: true,
      data: formattedData,
    };
  }

  async findPackageById(id: string) {
    const pkg = await this.prisma.package.findUnique({
      where: { id },
      include: { packageLists: true },
    });

    if (!pkg) {
      throw new NotFoundException('Package not found');
    }

    return pkg;
  }

  async createPackage(data: {
    name: string;
    description: string;
    price: number;
    currency?: string;
    billingCycle: string;
    packageListIds: string[];
  }) {
    const existing = await this.prisma.package.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw new ConflictException('Package name already exists');
    }

    const pkg = await this.prisma.package.create({
      data: {
        name: data.name,
        description: data.description,
        price: data.price,
        currency: data.currency || 'IDR',
        billingCycle: data.billingCycle,
        packageLists: {
          connect: data.packageListIds.map((id) => ({ id })),
        },
      },
      include: { packageLists: true },
    });

    return {
      success: true,
      message: 'Package created successfully',
      package: pkg,
    };
  }

  async updatePackage(
    id: string,
    data: {
      name?: string;
      description?: string;
      price?: number;
      currency?: string;
      billingCycle?: string;
      packageListIds?: string[];
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.package.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Package not found');
    }

    if (data.name && data.name !== existing.name) {
      const nameExists = await this.prisma.package.findUnique({
        where: { name: data.name },
      });
      if (nameExists) {
        throw new ConflictException('Package name already exists');
      }
    }

    const pkg = await this.prisma.package.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        price: data.price,
        currency: data.currency,
        billingCycle: data.billingCycle,
        isActive: data.isActive,
        packageLists: data.packageListIds
          ? {
              set: data.packageListIds.map((id) => ({ id })),
            }
          : undefined,
      },
      include: { packageLists: true },
    });

    return {
      success: true,
      message: 'Package updated successfully',
      package: pkg,
    };
  }

  async deletePackage(id: string) {
    const existing = await this.prisma.package.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Package not found');
    }

    await this.prisma.package.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Package deleted successfully',
    };
  }
}
