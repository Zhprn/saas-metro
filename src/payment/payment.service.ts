import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type { FinishNotifyRequest } from 'dana-node/webhook/v1';
import { DanaService } from './dana.service';
import { CreateOrderDto } from './dto/payment.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private danaService: DanaService,
  ) {}

  // Get all active packages for public view
  async getPackages() {
    const packages = await this.prisma.package.findMany({
      where: { isActive: true },
      include: {
        packageLists: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: packages.map((pkg) => ({
        ...pkg,
        features: pkg.packageLists ? pkg.packageLists.map((f) => f.name) : [],
        benefits: this.getPackageBenefits(pkg.name),
      })),
    };
  }

  // Helper: Return benefits for landing page display
  private getPackageBenefits(packageName: string): string[] {
    const benefitsMap: Record<string, string[]> = {
      'Free Trial': [
        'Up to 100 messages/day',
        'Basic analytics',
        'Email support',
        '1 connected account',
      ],
      Pro: [
        'Unlimited messages',
        'Advanced analytics',
        'Priority support',
        'Unlimited accounts',
        'Custom templates',
        'API access',
      ],
      Enterprise: [
        'Everything in Pro',
        'Dedicated support',
        'Custom integrations',
        'SLA guarantee',
        'Team collaboration',
        'White-label option',
      ],
    };
    return benefitsMap[packageName] || [];
  }

  // Create order and get DANA checkout URL
  async createOrder(userId: string, dto: CreateOrderDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const pkg = await this.prisma.package.findUnique({
      where: { id: dto.packageId },
    });

    if (!pkg || !pkg.isActive) {
      throw new NotFoundException('Package not found or inactive');
    }

    // Resume a recent pending order (DANA checkout link expires after ~25 min)
    const resumeAfter = new Date(Date.now() - 20 * 60 * 1000);
    const existingPayment = await this.prisma.payment.findFirst({
      where: {
        userId,
        packageId: pkg.id,
        status: 'PENDING',
        snapUrl: { not: null },
        createdAt: { gte: resumeAfter },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingPayment) {
      return {
        success: true,
        orderId: existingPayment.orderId,
        paymentId: existingPayment.id,
        redirectUrl: existingPayment.snapUrl,
        payment: {
          id: existingPayment.id,
          amount: existingPayment.amount,
          currency: existingPayment.currency,
          status: existingPayment.status,
        },
      };
    }

    const orderId = `ORDER-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        packageId: pkg.id,
        orderId,
        amount: pkg.price,
        currency: pkg.currency,
        status: 'PENDING',
      },
    });

    const frontendUrl = (process.env.FRONTEND_URL ?? '').replace(/\/+$/, '');

    try {
      const order = await this.danaService.createOrder({
        orderId,
        amount: pkg.price,
        title: `Paket ${pkg.name}`,
        returnUrl: `${frontendUrl}/user/payment?orderId=${encodeURIComponent(orderId)}`,
        goods: [{ id: pkg.id, name: pkg.name, price: pkg.price, quantity: 1 }],
      });

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          transactionId: order.referenceNo,
          // snapUrl column now stores the DANA checkout URL
          snapUrl: order.redirectUrl,
          paymentType: 'DANA',
        },
      });

      return {
        success: true,
        orderId,
        paymentId: payment.id,
        redirectUrl: order.redirectUrl,
        payment: {
          id: payment.id,
          amount: pkg.price,
          currency: pkg.currency,
          status: 'PENDING',
        },
      };
    } catch (error) {
      this.logger.error('Failed to create DANA order', error);

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });

      throw new BadRequestException('Failed to create payment transaction');
    }
  }

  /**
   * Handle a DANA finish notification. The signature must already be
   * verified (see PaymentController). Returns the body DANA expects.
   */
  async handleDanaNotification(notify: FinishNotifyRequest) {
    await this.applyStatus(notify.originalPartnerReferenceNo, {
      statusCode: notify.latestTransactionStatus,
      referenceNo: notify.originalReferenceNo,
      paidAt: notify.additionalInfo?.paidTime ?? notify.finishedTime,
      raw: notify,
    });

    return { responseCode: '2005600', responseMessage: 'Successful' };
  }

  /** Update a payment from a DANA status code; activates the subscription once. */
  private async applyStatus(
    orderId: string,
    info: {
      statusCode?: string;
      referenceNo?: string;
      paidAt?: string;
      raw: unknown;
    },
  ) {
    this.logger.log(`DANA status for order ${orderId}: ${info.statusCode}`);

    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (!payment) {
      this.logger.warn(`Payment not found for order ${orderId}`);
      return null;
    }

    const newStatus = DanaService.mapStatus(info.statusCode);

    // Ignore unknown codes, no-ops, and never downgrade a successful payment
    if (!newStatus || newStatus === payment.status || payment.status === 'SUCCESS') {
      return payment;
    }

    // Conditional update so a webhook and a manual sync arriving together
    // can't both create a subscription.
    const { count } = await this.prisma.payment.updateMany({
      where: { id: payment.id, status: payment.status },
      data: {
        status: newStatus,
        transactionId: info.referenceNo || payment.transactionId,
        paidAt:
          newStatus === 'SUCCESS'
            ? info.paidAt && !isNaN(Date.parse(info.paidAt))
              ? new Date(info.paidAt)
              : new Date()
            : null,
        metadata: JSON.stringify(info.raw),
      },
    });

    if (count === 0) {
      return payment;
    }

    if (newStatus === 'SUCCESS' && payment.packageId) {
      const pkg = await this.prisma.package.findUnique({
        where: { id: payment.packageId },
      });

      if (pkg) {
        const startDate = new Date();
        const endDate = new Date();
        const durationDays = pkg.billingCycle === 'yearly' ? 365 : 30;
        endDate.setDate(endDate.getDate() + durationDays);

        await this.prisma.subscription.create({
          data: {
            userId: payment.userId,
            packageId: pkg.id,
            status: 'ACTIVE',
            startDate,
            endDate,
          },
        });

        this.logger.log(`Subscription created for user ${payment.userId}`);
      }
    }

    return { ...payment, status: newStatus };
  }

  // Get user's payment history
  async getPaymentHistory(userId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return { data: payments };
  }

  // Get user's active subscription
  async getActiveSubscription(userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        endDate: { gte: new Date() },
      },
      include: {
        package: {
          include: {
            packageLists: true,
          },
        },
      },
      orderBy: { endDate: 'desc' },
    });

    if (!subscription) {
      return { subscription: null };
    }

    return {
      subscription: {
        ...subscription,
        package: {
          ...subscription.package,
          features: subscription.package.packageLists
            ? subscription.package.packageLists.map((f) => f.name)
            : [],
        },
      },
    };
  }

  // Ask DANA for the latest status and sync it to the database
  async checkPaymentStatus(userId: string, orderId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (!payment || payment.userId !== userId) {
      throw new NotFoundException('Payment not found');
    }

    try {
      const status = await this.danaService.queryPayment(orderId);

      const updated = await this.applyStatus(orderId, {
        statusCode: status.latestTransactionStatus,
        referenceNo: status.originalReferenceNo,
        paidAt: status.paidTime,
        raw: status,
      });

      return {
        success: true,
        orderId,
        status: updated?.status ?? payment.status,
        latestTransactionStatus: status.latestTransactionStatus,
        transactionStatusDesc: status.transactionStatusDesc,
        message: 'Status synced to database',
      };
    } catch (error) {
      this.logger.error(`Failed to query DANA status for ${orderId}`, error);
      throw new BadRequestException('Failed to check payment status');
    }
  }
}
