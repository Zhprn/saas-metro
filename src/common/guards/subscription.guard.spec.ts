import { ForbiddenException } from '@nestjs/common';
import { SubscriptionGuard } from './subscription.guard';

const ctx = (user: any) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as any;

const guardWith = (sub: any) =>
  new SubscriptionGuard({
    subscription: { findFirst: jest.fn().mockResolvedValue(sub) },
  } as any);

describe('SubscriptionGuard', () => {
  it('lets admins through without a subscription', async () => {
    await expect(
      guardWith(null).canActivate(ctx({ id: 'a', role: 'ADMIN' })),
    ).resolves.toBe(true);
  });

  it('lets users with an active subscription through', async () => {
    await expect(
      guardWith({ id: 's' }).canActivate(ctx({ id: 'u', role: 'USER' })),
    ).resolves.toBe(true);
  });

  it('blocks users without an active subscription', async () => {
    await expect(
      guardWith(null).canActivate(ctx({ id: 'u', role: 'USER' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
