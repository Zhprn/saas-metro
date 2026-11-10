import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ClientLogosService {
  constructor(private prisma: PrismaService) {}

  // ==================== CLIENT LOGO ====================

  async findAllClientLogos() {
    const logos = await this.prisma.clientLogo.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return { data: logos };
  }

  async findClientLogoById(id: string) {
    const logo = await this.prisma.clientLogo.findUnique({
      where: { id },
    });

    if (!logo) {
      throw new NotFoundException('Client logo not found');
    }

    return logo;
  }

  async createClientLogo(imageUrl: string) {
    const logo = await this.prisma.clientLogo.create({
      data: { imageUrl },
    });

    return {
      success: true,
      message: 'Client logo created successfully',
      logo,
    };
  }

  async updateClientLogo(id: string, imageUrl: string) {
    const existing = await this.prisma.clientLogo.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Client logo not found');
    }

    const logo = await this.prisma.clientLogo.update({
      where: { id },
      data: { imageUrl },
    });

    return {
      success: true,
      message: 'Client logo updated successfully',
      logo,
    };
  }

  async deleteClientLogo(id: string) {
    const existing = await this.prisma.clientLogo.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Client logo not found');
    }

    await this.prisma.clientLogo.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Client logo deleted successfully',
    };
  }
}
