import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreatePackageListDto,
  UpdatePackageListDto,
} from '../dto/package-list.dto';

@Injectable()
export class PackageListService {
  constructor(private prisma: PrismaService) {}

  // Membuat fitur baru (Master)
  async create(dto: CreatePackageListDto) {
    const existing = await this.prisma.packageList.findUnique({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException('A feature with this name already exists');
    }

    return this.prisma.packageList.create({
      data: { name: dto.name },
    });
  }

  // Mengambil semua daftar fitur untuk dipilih di Package
  async findAll() {
    return this.prisma.packageList.findMany({
      orderBy: { name: 'asc' },
    });
  }

  // Menghapus fitur master
  async delete(id: string) {
    const existing = await this.prisma.packageList.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Fitur Not Found');
    }

    return this.prisma.packageList.delete({
      where: { id },
    });
  }
}
