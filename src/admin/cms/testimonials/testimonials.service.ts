import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTestimonialDto } from './dto/create-testimonial.dto';
import { UpdateTestimonialDto } from './dto/update-testimonial.dto';
import { TestimonialStatus } from '@prisma/client';

@Injectable()
export class TestimonialsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTestimonialDto) {
    return this.prisma.testimonial.create({
      data: dto,
    });
  }

  async findAll() {
    return this.prisma.testimonial.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, dto: UpdateTestimonialDto) {
    const exists = await this.prisma.testimonial.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Testimonial not found');

    return this.prisma.testimonial.update({
      where: { id },
      data: dto,
    });
  }

  async getStats() {
    const aggregate = await this.prisma.testimonial.aggregate({
      _count: { id: true },
      _avg: { rating: true },
    });

    const publishedCount = await this.prisma.testimonial.count({
      where: { status: TestimonialStatus.PUBLISHED },
    });

    const pendingCount = await this.prisma.testimonial.count({
      where: { status: TestimonialStatus.PENDING },
    });

    const archivedCount = await this.prisma.testimonial.count({
      where: { status: TestimonialStatus.ARCHIVED },
    });

    const distribution = await this.prisma.testimonial.groupBy({
      by: ['rating'],
      _count: { rating: true },
      orderBy: { rating: 'desc' },
    });

    return {
      total: aggregate._count.id,
      published: publishedCount,
      pending: pendingCount,
      archived: archivedCount,
      averageRating: aggregate._avg.rating
        ? Number(aggregate._avg.rating.toFixed(1))
        : 0,
      ratingDistribution: distribution,
    };
  }

  async getForLandingPage(limit: number = 6, minRating: number = 4) {
    return this.prisma.testimonial.findMany({
      where: {
        status: TestimonialStatus.PUBLISHED,
        isFeatured: true,
        rating: { gte: minRating },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(id: string, status: TestimonialStatus) {
    const exists = await this.prisma.testimonial.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Testimonial not found');

    return this.prisma.testimonial.update({
      where: { id },
      data: { status },
    });
  }

  async remove(id: string) {
    const exists = await this.prisma.testimonial.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Testimonial not found');

    return this.prisma.testimonial.delete({ where: { id } });
  }
}
