import { Injectable, BadRequestException } from '@nestjs/common';
import { google } from 'googleapis';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class GoogleEmailService {
  private oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_EMAIL_REDIRECT_URI!, // e.g. http://localhost:3000/email/google/callback
  );

  constructor(private prisma: PrismaService) {}

  getAuthUrl(state: string) {
    const scopes = [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
    ];
    return this.oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
      state,
    });
  }

  async handleCallback(code: string, ownerId: string) {
    // 1) Exchange code for tokens
    const { tokens } = await this.oauth2.getToken(code);
    this.oauth2.setCredentials(tokens);

    // 2) Get the Gmail address using Gmail API (works with gmail.send scope)
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2 });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const email = profile.data.emailAddress;
    if (!email) {
      throw new BadRequestException(
        'Could not determine Gmail address from profile',
      );
    }

    // 3) Handle missing refresh_token (happens if user had already granted)
    let refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      const existing = await this.prisma.gmailAccount.findUnique({
        where: { email },
      });
      refreshToken = existing?.refreshToken || null;
    }
    if (!refreshToken) {
      throw new BadRequestException(
        'No refresh_token returned. Reconnect after removing previous grant in Google Account > Security > Third-party access, or keep using the existing stored refresh token.',
      );
    }

    // 4) Persist tokens
    await this.prisma.gmailAccount.upsert({
      where: { email },
      update: {
        ownerId,
        accessToken: tokens.access_token ?? undefined,
        refreshToken,
        tokenType: tokens.token_type ?? 'Bearer',
        expiryDate: BigInt(tokens.expiry_date ?? 0),
      },
      create: {
        ownerId,
        email,
        accessToken: tokens.access_token ?? '',
        refreshToken,
        tokenType: tokens.token_type ?? 'Bearer',
        expiryDate: BigInt(tokens.expiry_date ?? 0),
      },
    });

    return { email };
  }

  /** Get an authorized Gmail client; auto-persists refreshed tokens */
  async getAuthorizedClient(fromEmail: string) {
    const account = await this.prisma.gmailAccount.findUnique({
      where: { email: fromEmail },
    });
    if (!account)
      throw new BadRequestException(
        'No Gmail account connected for this address.',
      );

    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_EMAIL_REDIRECT_URI,
    );

    // Load tokens from DB
    oAuth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
      token_type: account.tokenType,
      expiry_date: Number(account.expiryDate),
    });

    // Force refresh if expired or invalid
    try {
      const tokenInfo = await oAuth2Client.getTokenInfo(account.accessToken);
      const now = Date.now();
      const exp = account.expiryDate ? Number(account.expiryDate) : 0;
      if (exp < now - 60000) throw new Error('Token expired');
      // token still valid
    } catch {
      console.log('Refreshing Gmail access token...');
      const { credentials } = await oAuth2Client.refreshAccessToken();
      oAuth2Client.setCredentials(credentials);

      await this.prisma.gmailAccount.update({
        where: { id: account.id },
        data: {
          accessToken: credentials.access_token!,
          expiryDate: BigInt(credentials.expiry_date ?? Date.now() + 3600_000),
        },
      });
    }

    return google.gmail({ version: 'v1', auth: oAuth2Client });
  }

  /** Get all Gmail accounts for a user */
  async getAccounts(ownerId: string) {
    const accounts = await this.prisma.gmailAccount.findMany({
      where: { ownerId },
      select: {
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return accounts;
  }
}
