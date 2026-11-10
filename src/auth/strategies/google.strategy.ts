import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly prisma: PrismaService) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      scope: ['profile', 'email'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    const email = profile.emails?.[0]?.value;
    if (!email)
      return done(new Error('Google profile must include email'), null);

    const name = profile.displayName ?? null;
    const picture = profile.photos?.[0]?.value ?? null;

    // user is typed as User | null but with accounts included
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          {
            accounts: {
              some: { provider: 'google', providerAccountId: profile.id },
            },
          },
          { email },
        ],
      },
      include: { accounts: true },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          name,
          picture,
          role: 'USER',
          accounts: {
            create: {
              provider: 'google',
              providerAccountId: profile.id,
              access_token: accessToken, // snake_case if that's your schema
              refresh_token: refreshToken, // snake_case
            },
          },
        },
        include: { accounts: true }, // keep types consistent with the variable
      });
    } else {
      const linked = user.accounts.some(
        (a) => a.provider === 'google' && a.providerAccountId === profile.id,
      );
      if (!linked) {
        await this.prisma.account.create({
          data: {
            provider: 'google',
            providerAccountId: profile.id,
            access_token: accessToken,
            refresh_token: refreshToken,
            userId: user.id,
          },
        });
        // refresh user with accounts if needed
        user = await this.prisma.user.findUnique({
          where: { id: user.id },
          include: { accounts: true },
        });
      }

      // optional: keep profile in sync
      if (user && (user.name !== name || user.picture !== picture)) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { name, picture },
          include: { accounts: true },
        });
      }
    }

    // at this point user is non-null
    return done(null, {
      userId: user!.id,
      role: user!.role as 'ADMIN' | 'USER',
    });
  }
}
