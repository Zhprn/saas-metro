import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import { GoogleEmailService } from 'src/email/google.service';
import { verifyEmailHtml } from './templates/verify-email';
import { LoginDto } from './dto/login.dto';

function base64url(buf: Buffer) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
const sha256 = (input: string) =>
  crypto.createHash('sha256').update(input).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private gmail: GoogleEmailService,
  ) {}

  // -------------------- TOKEN SIGNING --------------------
  signToken(userId: string, role: 'ADMIN' | 'USER') {
    return this.jwtService.sign({ sub: userId, role });
  }

  // -------------------- SEND VERIFICATION --------------------
  private async sendVerificationEmail(user: {
    id: string;
    email: string;
    name?: string | null;
  }) {
    const ttlRaw =
      process.env.VERIFY_TOKEN_TTL_MIN ?? process.env.VERIFY_TOKEN_TTL_MINUTES;
    const ttlMin = Number(ttlRaw ?? 30);
    const token = base64url(crypto.randomBytes(32));
    const tokenHash = sha256(token);

    // invalidate old unused tokens
    await this.prisma.emailVerification.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });

    const expiresAt = new Date(Date.now() + ttlMin * 60_000);

    await this.prisma.emailVerification.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const verifyUrl = `${process.env.APP_URL}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const from = process.env.VERIFY_FROM_EMAIL!;
    const client = await this.gmail.getAuthorizedClient(from);

    const html = verifyEmailHtml(user.name, verifyUrl);
    const raw = Buffer.from(
      [
        `From: ${from}`,
        `To: ${user.email}`,
        `Subject: Verify your email`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        '',
        html,
      ].join('\n'),
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await client.users.messages.send({ userId: 'me', requestBody: { raw } });
  }

  // -------------------- REGISTER --------------------
  async register(data: {
    email: string;
    password: string;
    name?: string | null;
  }) {
    const exists = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (exists) {
      if (exists.emailVerifiedAt)
        throw new ConflictException('Email already registered');

      const hashed = await bcrypt.hash(data.password, 10);
      const updated = await this.prisma.user.update({
        where: { id: exists.id },
        data: { password: hashed, name: data.name ?? exists.name ?? null },
      });

      await this.sendVerificationEmail(updated);

      return {
        success: true,
        message:
          'Account already exists but is not verified. We resent the verification email.',
        user: {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          role: updated.role,
        },
      };
    }

    const hashed = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: { email: data.email, password: hashed, name: data.name ?? null },
    });

    await this.sendVerificationEmail(user);

    return {
      success: true,
      message:
        'Registered successfully. Please check your email to verify your account.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  // -------------------- VERIFY --------------------
  async verifyEmail(token: string) {
    const tokenHash = sha256(token);
    const rec = await this.prisma.emailVerification.findFirst({
      where: { tokenHash, usedAt: null },
      include: { user: true },
    });

    if (!rec) throw new BadRequestException('Invalid or already used token');

    if (rec.expiresAt < new Date()) {
      await this.prisma.emailVerification.update({
        where: { id: rec.id },
        data: { usedAt: new Date() },
      });
      throw new BadRequestException(
        'Token expired. Please request a new verification email.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: rec.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.emailVerification.update({
        where: { id: rec.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { success: true, message: 'Email verified successfully.' };
  }

  // -------------------- RESEND VERIFICATION --------------------
  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { success: true };
    if (user.emailVerifiedAt)
      return { success: true, message: 'Already verified' };

    // cooldown: 1 min
    const recent = await this.prisma.emailVerification.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (recent && Date.now() - recent.createdAt.getTime() < 60_000)
      throw new BadRequestException(
        'Please wait a moment before requesting again.',
      );

    await this.sendVerificationEmail(user);
    return { success: true, message: 'Verification email sent' };
  }

  // -------------------- LOGIN --------------------
  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.password)
      throw new ConflictException('Invalid credentials');

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) throw new ConflictException('Invalid credentials');

    if (!user.emailVerifiedAt)
      throw new ForbiddenException(
        'Email not verified. Please verify your email first.',
      );

    const accessToken = this.signToken(user.id, user.role as 'ADMIN' | 'USER');
    return {
      access_token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  // -------------------- LOGOUT --------------------
  async logout(id: string, token: string) {
    await this.prisma.tokenBlacklist.create({
      data: { token, userId: id, createdAt: new Date() },
    });
    return { message: 'Logout successful', success: true };
  }

  // -------------------- GOOGLE REDIRECT --------------------
  async buildGoogleRedirectUrl(payload: {
    userId: string;
    role: 'ADMIN' | 'USER';
  }) {
    const token = this.signToken(payload.userId, payload.role);
    return `${process.env.FRONTEND_URL}/auth/callback?token=${token}`;
  }
}
