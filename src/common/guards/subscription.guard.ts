import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export const SUBSCRIPTION_REQUIRED = 'SUBSCRIPTION_REQUIRED';

/** Same rule as PaymentService.getActiveSubscription: ACTIVE and not past endDate. */
export async function hasActiveSubscription(
  prisma: PrismaService,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: 'ACTIVE', endDate: { gte: new Date() } },
    select: { id: true },
  });
  return !!sub;
}

/** Blocks feature endpoints for users without an active package. Admins bypass. Use after JwtAuthGuard. */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest();
    if (user?.role === 'ADMIN') return true;
    if (await hasActiveSubscription(this.prisma, user?.id)) return true;
    throw new ForbiddenException(SUBSCRIPTION_REQUIRED);
  }
}
