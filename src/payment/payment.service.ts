import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { MidtransService } from './midtrans.service';
import { CreateOrderDto, PaymentNotificationDto } from './dto/payment.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private midtransService: MidtransService,
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
      clientKey: this.midtransService.getClientKey(),
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

  // Create order and get Snap token
  async createOrder(userId: string, dto: CreateOrderDto) {
    // Get user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get package
    const pkg = await this.prisma.package.findUnique({
      where: { id: dto.packageId },
    });

    if (!pkg || !pkg.isActive) {
      throw new NotFoundException('Package not found or inactive');
    }

    // Check for existing pending payment to resume
    const existingPayment = await this.prisma.payment.findFirst({
      where: {
        userId,
        packageId: pkg.id,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });

    // If there's an existing pending payment with a snap token, return it
    if (existingPayment && existingPayment.snapToken) {
      return {
        success: true,
        orderId: existingPayment.orderId,
        token: existingPayment.snapToken,
        redirectUrl: existingPayment.snapUrl,
        payment: {
          id: existingPayment.id,
          amount: existingPayment.amount,
          currency: existingPayment.currency,
          status: existingPayment.status,
        },
      };
    }

    // Generate unique order ID
    const orderId = `ORDER-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;

    // Create payment record (PENDING)
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

    try {
      // Create Midtrans transaction
      const transaction = await this.midtransService.createTransaction({
        orderId,
        amount: pkg.price,
        customerDetails: {
          firstName: user.name || user.email.split('@')[0],
          email: user.email,
          phone: user.telephone || undefined,
        },
        itemDetails: [
          {
            id: pkg.id,
            name: pkg.name,
            price: pkg.price,
            quantity: 1,
          },
        ],
      });

      // Update payment with snap token
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          snapToken: transaction.token,
          snapUrl: transaction.redirect_url,
        },
      });

      return {
        success: true,
        orderId,
        token: transaction.token,
        redirectUrl: transaction.redirect_url,
        payment: {
          id: payment.id,
          amount: pkg.price,
          currency: pkg.currency,
          status: 'PENDING',
        },
      };
    } catch (error) {
      this.logger.error('Failed to create Midtrans transaction', error);

      // Update payment status to failed
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });

      throw new BadRequestException('Failed to create payment transaction');
    }
  }

  // Handle Midtrans webhook notification
  async handleNotification(notification: PaymentNotificationDto) {
    const { order_id, transaction_status, payment_type, transaction_id } =
      notification;

    this.logger.log(
      `Received notification for order ${order_id}: ${transaction_status}`,
    );

    // Find payment
    const payment = await this.prisma.payment.findUnique({
      where: { orderId: order_id },
    });

    if (!payment) {
      this.logger.warn(`Payment not found for order ${order_id}`);
      return { status: 'ok', message: 'Payment not found' };
    }

    let newStatus = payment.status;

    // Map Midtrans status to our status
    if (
      transaction_status === 'capture' ||
      transaction_status === 'settlement'
    ) {
      newStatus = 'SUCCESS';
    } else if (transaction_status === 'pending') {
      newStatus = 'PENDING';
    } else if (
      transaction_status === 'deny' ||
      transaction_status === 'cancel' ||
      transaction_status === 'failure'
    ) {
      newStatus = 'FAILED';
    } else if (transaction_status === 'expire') {
      newStatus = 'EXPIRED';
    }

    // Update payment
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        paymentType: payment_type || payment.paymentType,
        transactionId: transaction_id || payment.transactionId,
        paidAt: newStatus === 'SUCCESS' ? new Date() : null,
        metadata: JSON.stringify(notification),
      },
    });

    // If payment successful, create subscription
    if (newStatus === 'SUCCESS' && payment.packageId) {
      const pkg = await this.prisma.package.findUnique({
        where: { id: payment.packageId },
      });

      if (pkg) {
        const startDate = new Date();
        const endDate = new Date();
        // Calculate duration based on billingCycle
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

    return { status: 'ok' };
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

  // Check payment status manually and sync with database
  async checkPaymentStatus(orderId: string) {
    try {
      const status = await this.midtransService.getTransactionStatus(orderId);

      // Auto-sync status to database
      if (status.transaction_status) {
        await this.handleNotification({
          transaction_status: status.transaction_status,
          order_id: orderId,
          gross_amount: status.gross_amount,
          payment_type: status.payment_type,
          transaction_id: status.transaction_id,
        });
      }

      return {
        ...status,
        message: 'Status synced to database',
      };
    } catch (error) {
      throw new BadRequestException('Failed to check payment status');
    }
  }
}
