import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard.auth';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // ==================== DASHBOARD ====================
  @Get('dashboard/statistik')
  async getStatistik() {
    return this.dashboardService.getStatistik();
  }

  @Get('dashboard/user-terbaru')
  async getUserTerbaru() {
    return this.dashboardService.getUserTerbaru();
  }

  @Get('dashboard/user-bulanan')
  async getUserBulanan() {
    return this.dashboardService.getUserBulanan();
  }

  @Get('dashboard/pembayaran-terbaru')
  async getPembayaranTerbaru() {
    return this.dashboardService.getPembayaranTerbaru();
  }

  @Get('dashboard/status-sistem')
  async getStatusSistem() {
    return this.dashboardService.getStatusSistem();
  }
}
