import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Dana } from 'dana-node';
import type {
  CreateOrderByRedirectRequest,
  QueryPaymentResponse,
} from 'dana-node/payment_gateway/v1';
import { WebhookParser, type FinishNotifyRequest } from 'dana-node/webhook/v1';

/**
 * DANA Enterprise (Payment Gateway, redirect / hosted checkout) wrapper.
 *
 * Env vars:
 *  - DANA_ENV               sandbox | production (default sandbox)
 *  - X_PARTNER_ID           Client ID from dashboard.dana.id
 *  - DANA_MERCHANT_ID       Merchant ID from dashboard.dana.id
 *  - PRIVATE_KEY            Your RSA private key (PEM, "\n" escaped OK)
 *  - DANA_PUBLIC_KEY        DANA's public key, used to verify webhooks
 *  - ORIGIN                 Your website origin (e.g. https://app.example.com)
 *  - DANA_MCC               Merchant category code (default 5732)
 *  - APP_URL                Public backend URL (webhook target)
 *  - FRONTEND_URL           Where the user returns after paying
 */
@Injectable()
export class DanaService {
  private readonly logger = new Logger(DanaService.name);
  private readonly client: Dana;
  private webhookParser?: WebhookParser;

  /** Path DANA will POST the finish notification to (must match the controller route). */
  static readonly NOTIFY_PATH = '/payment/notification';

  constructor(private configService: ConfigService) {
    const env = this.configService.get<string>('DANA_ENV') || 'sandbox';
    // The SDK reads process.env.DANA_ENV internally for validation, keep it in sync.
    process.env.DANA_ENV = env;

    this.client = new Dana({
      partnerId: this.configService.get('X_PARTNER_ID'),
      privateKey: this.configService.get('PRIVATE_KEY'),
      origin: this.configService.get('ORIGIN'),
      env,
      debugMode: env === 'sandbox' ? 'true' : 'false',
    });

    this.logger.log(`DANA initialized in ${env.toUpperCase()} mode`);
  }

  private get merchantId(): string {
    return this.configService.get<string>('DANA_MERCHANT_ID') || '';
  }

  /** Format a date as YYYY-MM-DDTHH:mm:ss+07:00 (Jakarta time), as DANA requires. */
  static toJakartaTime(date: Date): string {
    const jkt = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    return jkt.toISOString().replace(/\.\d{3}Z$/, '+07:00');
  }

  /** DANA amounts are strings with 2 decimals, e.g. "150000.00". */
  static toMoney(amount: number) {
    return { value: amount.toFixed(2), currency: 'IDR' };
  }

  async createOrder(params: {
    orderId: string;
    amount: number;
    title: string;
    returnUrl: string;
    goods: { id: string; name: string; price: number; quantity: number }[];
  }) {
    const appUrl = (this.configService.get<string>('APP_URL') || '').replace(
      /\/+$/,
      '',
    );

    // Sandbox rejects validUpTo > 30 min ahead; production allows up to 7 days.
    const validUpTo = DanaService.toJakartaTime(
      new Date(Date.now() + 25 * 60 * 1000),
    );

    const request: CreateOrderByRedirectRequest = {
      partnerReferenceNo: params.orderId,
      merchantId: this.merchantId,
      amount: DanaService.toMoney(params.amount),
      validUpTo,
      urlParams: [
        { url: params.returnUrl, type: 'PAY_RETURN', isDeeplink: 'N' },
        {
          url: `${appUrl}${DanaService.NOTIFY_PATH}`,
          type: 'NOTIFICATION',
          isDeeplink: 'N',
        },
      ],
      additionalInfo: {
        mcc: this.configService.get<string>('DANA_MCC') || '5732',
        envInfo: {
          sourcePlatform: 'IPG',
          terminalType: 'SYSTEM',
          orderTerminalType: 'WEB',
        },
        order: {
          orderTitle: params.title,
          scenario: 'REDIRECT',
          goods: params.goods.map((g) => ({
            name: g.name,
            merchantGoodsId: g.id,
            description: g.name,
            category: 'subscription',
            price: DanaService.toMoney(g.price),
            quantity: String(g.quantity),
          })),
        },
      },
    };

    const response = await this.client.paymentGatewayApi.createOrder(request);

    if (!response.webRedirectUrl) {
      throw new Error(
        `DANA createOrder failed: ${response.responseCode} ${response.responseMessage}`,
      );
    }

    return {
      referenceNo: response.referenceNo,
      redirectUrl: response.webRedirectUrl,
    };
  }

  async queryPayment(orderId: string): Promise<QueryPaymentResponse> {
    return this.client.paymentGatewayApi.queryPayment({
      originalPartnerReferenceNo: orderId,
      serviceCode: '54',
      merchantId: this.merchantId,
    });
  }

  /**
   * Verify the X-SIGNATURE of a finish notification and return its parsed body.
   * Throws if the signature is invalid.
   */
  parseWebhook(
    method: string,
    path: string,
    headers: Record<string, string>,
    rawBody: string,
  ): FinishNotifyRequest {
    if (!this.webhookParser) {
      this.webhookParser = new WebhookParser(
        this.configService.get('DANA_PUBLIC_KEY'),
        this.configService.get('DANA_PUBLIC_KEY_PATH'),
      );
    }
    return this.webhookParser.parseWebhook(method, path, headers, rawBody);
  }

  /**
   * Map DANA latestTransactionStatus to our Payment.status.
   * 00 Success, 01 Initiated, 02 Paying, 05 Cancelled, 07 Not found.
   */
  static mapStatus(code?: string): 'SUCCESS' | 'PENDING' | 'EXPIRED' | null {
    switch (code) {
      case '00':
        return 'SUCCESS';
      case '01':
      case '02':
        return 'PENDING';
      case '05': // closed: expired or cancelled before payment
        return 'EXPIRED';
      default:
        return null;
    }
  }
}
