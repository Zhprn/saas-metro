import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaymentQueryDto, UpdatePaymentDto } from './dto/payment-query.dto';
import * as ExcelJS from 'exceljs';

@Injectable()
export class PaymentService {
  constructor(private prisma: PrismaService) {}

  // ==================== PAYMENT MANAGEMENT ====================

  async findAllPayments(query: PaymentQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const { search, status, startDate, endDate, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    // Search by orderId or user email
    if (search) {
      where.OR = [
        { orderId: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Filter by status
    if (status && status !== 'all') {
      const statusMap: Record<string, string> = {
        paid: 'SUCCESS',
        pending: 'PENDING',
        failed: 'FAILED',
      };
      where.status = statusMap[status];
    }

    // Filter by date range
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

    // Build orderBy
    let orderBy: any = { createdAt: sortOrder || 'desc' };
    if (sortBy === 'orderId') {
      orderBy = { orderId: sortOrder || 'desc' };
    } else if (sortBy === 'paymentMethod') {
      orderBy = { paymentType: sortOrder || 'asc' };
    } else if (sortBy === 'status') {
      orderBy = { status: sortOrder || 'asc' };
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          user: { select: { email: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    // Format response sesuai UI
    const formattedData = payments.map((payment, index) => ({
      id: payment.id,
      no: skip + index + 1,
      orderId: payment.orderId,
      email: payment.user?.email || '-',
      tanggalPesan: payment.createdAt.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
      paymentMethod: payment.paymentType || '-',
      totalPembayaran: payment.amount,
      status:
        payment.status === 'SUCCESS'
          ? 'Paid'
          : payment.status === 'PENDING'
            ? 'Pending'
            : 'Failed',
    }));

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

  async exportPaymentsToExcel(query: PaymentQueryDto): Promise<Buffer> {
    const { status, startDate, endDate } = query;

    const where: any = {};

    if (status && status !== 'all') {
      const statusMap: Record<string, string> = {
        paid: 'SUCCESS',
        pending: 'PENDING',
        failed: 'FAILED',
      };
      where.status = statusMap[status];
    }

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

    const payments = await this.prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true, name: true } },
      },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Payments');

    worksheet.columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Order ID', key: 'orderId', width: 30 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Package', key: 'package', width: 20 },
      { header: 'Payment Date', key: 'paymentDate', width: 15 },
      { header: 'Payment Method', key: 'paymentMethod', width: 15 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
    ];

    payments.forEach((payment, index) => {
      worksheet.addRow({
        no: index + 1,
        orderId: payment.orderId,
        email: payment.user?.email || '-',
        package: '-',
        paymentDate: payment.createdAt.toLocaleDateString('id-ID'),
        paymentMethod: payment.paymentType || '-',
        amount: payment.amount,
        status: payment.status,
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  }

  async findPaymentById(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  async updatePayment(id: string, dto: UpdatePaymentDto) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const updated = await this.prisma.payment.update({
      where: { id },
      data: {
        status: dto.status,
        paidAt: dto.status === 'SUCCESS' ? new Date() : null,
      },
    });

    return {
      success: true,
      message: 'Payment updated successfully',
      payment: updated,
    };
  }

  async deletePayment(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    await this.prisma.payment.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Payment deleted successfully',
    };
  }
}
