import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  // ==================== DASHBOARD ====================

  // Helper untuk hitung pertumbuhan
  private hitungPertumbuhan(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  // GET /admin/dashboard/statistik
  async getStatistik() {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Total Akun
    const totalAkun = await this.prisma.user.count();
    const totalAkunBulanLalu = await this.prisma.user.count({
      where: { createdAt: { lt: startOfThisMonth } },
    });

    // Akun Aktif (punya subscription aktif)
    const akunAktif = await this.prisma.user.count({
      where: {
        subscriptions: {
          some: {
            status: 'ACTIVE',
            endDate: { gte: now },
          },
        },
      },
    });
    const akunAktifBulanLalu = await this.prisma.user.count({
      where: {
        subscriptions: {
          some: {
            status: 'ACTIVE',
            endDate: { gte: startOfThisMonth },
            startDate: { lt: startOfThisMonth },
          },
        },
      },
    });

    // Akun Nonaktif
    const akunNonaktif = totalAkun - akunAktif;
    const akunNonaktifBulanLalu = totalAkunBulanLalu - akunAktifBulanLalu;

    // Total Transaksi Sukses
    const totalTransaksi = await this.prisma.payment.count({
      where: { status: 'SUCCESS' },
    });
    const totalTransaksiBulanLalu = await this.prisma.payment.count({
      where: {
        status: 'SUCCESS',
        createdAt: { lt: startOfThisMonth },
      },
    });

    return {
      totalAkun,
      akunAktif,
      akunNonaktif,
      totalTransaksi,
      pertumbuhanAkun: this.hitungPertumbuhan(totalAkun, totalAkunBulanLalu),
      pertumbuhanAktif: this.hitungPertumbuhan(akunAktif, akunAktifBulanLalu),
      pertumbuhanNonaktif: this.hitungPertumbuhan(
        akunNonaktif,
        akunNonaktifBulanLalu,
      ),
      pertumbuhanTransaksi: this.hitungPertumbuhan(
        totalTransaksi,
        totalTransaksiBulanLalu,
      ),
    };
  }

  // GET /admin/dashboard/user-terbaru
  async getUserTerbaru() {
    const now = new Date();
    const recentUsers = await this.prisma.user.findMany({
      take: 4,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        createdAt: true,
        subscriptions: {
          where: { status: 'ACTIVE', endDate: { gte: now } },
          take: 1,
        },
      },
    });

    return recentUsers.map((user, index) => ({
      no: index + 1,
      idKlien: `#${user.id.slice(-8).toUpperCase()}`,
      email: user.email,
      tanggalDaftar: user.createdAt.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
      status: user.subscriptions.length > 0 ? 'Active' : 'Inactive',
    }));
  }

  // GET /admin/dashboard/user-bulanan
  async getUserBulanan() {
    const now = new Date();
    const namaBulan = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const userBaruBulanan: { bulan: string; jumlah: number }[] = [];

    for (let i = 0; i < 12; i++) {
      const bulanIndex = (now.getMonth() - 11 + i + 12) % 12;
      const tahun = now.getFullYear() - (now.getMonth() - 11 + i < 0 ? 1 : 0);
      const startDate = new Date(tahun, bulanIndex, 1);
      const endDate = new Date(tahun, bulanIndex + 1, 1);

      const jumlah = await this.prisma.user.count({
        where: {
          createdAt: { gte: startDate, lt: endDate },
        },
      });

      userBaruBulanan.push({
        bulan: namaBulan[bulanIndex],
        jumlah,
      });
    }

    return userBaruBulanan;
  }

  // GET /admin/dashboard/pembayaran-terbaru
  async getPembayaranTerbaru() {
    const recentPayments = await this.prisma.payment.findMany({
      take: 4,
      where: { status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
      select: {
        orderId: true,
        createdAt: true,
        paymentType: true,
        amount: true,
      },
    });

    return recentPayments.map((payment, index) => ({
      no: index + 1,
      idOrder: `#${payment.orderId.slice(-8).toUpperCase()}`,
      tanggalOrder: payment.createdAt.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
      metodePembayaran: payment.paymentType || 'Unknown',
      totalPembayaran: payment.amount,
    }));
  }

  // GET /admin/dashboard/status-sistem
  async getStatusSistem() {
    return {
      whatsapp: 'Connected',
      email: 'Active',
      paymentGateway: 'Operational',
      aiEngine: 'Running normally',
      terakhirDicek: new Date().toISOString(),
    };
  }
}
