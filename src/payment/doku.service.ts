import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type { IncomingHttpHeaders } from 'http';

/** Fields we use from DOKU notifications and check-status responses. */
export interface DokuTransaction {
  order?: { invoice_number?: string };
  transaction?: { status?: string; date?: string };
}

/**
 * DOKU Checkout (hosted payment page, QRIS only) wrapper.
 * Docs: https://developers.doku.com/accept-payments/doku-checkout/integration-guide/backend-integration
 *
 * Env vars:
 *  - DOKU_ENV         sandbox | production (default sandbox)
 *  - DOKU_CLIENT_ID   Client ID from the DOKU dashboard (API Keys)
 *  - DOKU_SECRET_KEY  Secret Key from the DOKU dashboard (API Keys)
 *
 * The notification URL (<APP_URL>/payment/notification) is set in the DOKU dashboard.
 */
@Injectable()
export class DokuService {
  private readonly logger = new Logger(DokuService.name);
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    const env = this.configService.get<string>('DOKU_ENV') || 'sandbox';
    this.baseUrl =
      env === 'production'
        ? 'https://api.doku.com'
        : 'https://api-sandbox.doku.com';

    this.logger.log(`DOKU initialized in ${env.toUpperCase()} mode`);
  }

  // An empty secret would make webhook signatures forgeable, so never fall back.
  private required(key: 'DOKU_CLIENT_ID' | 'DOKU_SECRET_KEY'): string {
    const value = this.configService.get<string>(key);
    if (!value) throw new Error(`${key} is not configured`);
    return value;
  }

  /** https://developers.doku.com/get-started-with-doku-api/signature-component/non-snap/signature-component-from-request-header */
  private sign(
    requestId: string,
    timestamp: string,
    target: string,
    body?: string,
  ): string {
    const lines = [
      `Client-Id:${this.required('DOKU_CLIENT_ID')}`,
      `Request-Id:${requestId}`,
      `Request-Timestamp:${timestamp}`,
      `Request-Target:${target}`,
    ];
    if (body !== undefined) {
      const digest = createHash('sha256').update(body).digest('base64');
      lines.push(`Digest:${digest}`);
    }
    const hmac = createHmac('sha256', this.required('DOKU_SECRET_KEY'))
      .update(lines.join('\n'))
      .digest('base64');
    return `HMACSHA256=${hmac}`;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    target: string,
    body?: string,
  ): Promise<T | null> {
    const requestId = randomUUID();
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

    const response = await fetch(`${this.baseUrl}${target}`, {
      method,
      headers: {
        'Client-Id': this.required('DOKU_CLIENT_ID'),
        'Request-Id': requestId,
        'Request-Timestamp': timestamp,
        Signature: this.sign(requestId, timestamp, target, body),
        'Content-Type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(15000),
    });

    if (method === 'GET' && response.status === 404) return null;
    if (!response.ok) {
      throw new Error(
        `DOKU ${method} ${target} failed: ${response.status} ${await response.text()}`,
      );
    }
    return (await response.json()) as T;
  }

  async createOrder(params: {
    orderId: string;
    amount: number;
    returnUrl: string;
  }) {
    const result = await this.request<{
      response?: { payment?: { url?: string; token_id?: string } };
    }>(
      'POST',
      '/checkout/v1/payment',
      JSON.stringify({
        order: {
          amount: params.amount,
          invoice_number: params.orderId,
          callback_url: params.returnUrl,
          callback_url_result: params.returnUrl,
          auto_redirect: true,
        },
        payment: {
          payment_due_date: 25, // minutes
          payment_method_types: ['QRIS'],
        },
      }),
    );

    const payment = result?.response?.payment;
    if (!payment?.url) {
      throw new Error('DOKU createOrder failed: no payment url in response');
    }

    return { referenceNo: payment.token_id, redirectUrl: payment.url };
  }

  /** Returns null when DOKU has no transaction for this order. */
  async queryPayment(orderId: string): Promise<DokuTransaction | null> {
    return this.request<DokuTransaction>(
      'GET',
      `/orders/v1/status/${encodeURIComponent(orderId)}`,
    );
  }

  /**
   * Verify the Signature of a notification and return its parsed body.
   * Throws if the signature is invalid.
   */
  parseWebhook(
    path: string,
    headers: IncomingHttpHeaders,
    rawBody: string,
  ): DokuTransaction {
    // sign() uses our own Client-Id, so a notification for another client fails too
    const expected = Buffer.from(
      this.sign(
        String(headers['request-id']),
        String(headers['request-timestamp']),
        path,
        rawBody,
      ),
    );
    const received = Buffer.from(String(headers['signature']));

    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new Error('Invalid signature');
    }
    return JSON.parse(rawBody) as DokuTransaction;
  }

  /** Map DOKU transaction.status to our Payment.status. */
  static mapStatus(status?: string): 'SUCCESS' | 'PENDING' | 'EXPIRED' | null {
    switch (status) {
      case 'SUCCESS':
      case 'PENDING':
      case 'EXPIRED':
        return status;
      default: // FAILED is not final in DOKU: the customer can retry on the same page
        return null;
    }
  }
}
