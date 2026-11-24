import { createHash, createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { DokuService } from './doku.service';

const PATH = '/payment/notification';
const BODY = JSON.stringify({
  order: { invoice_number: 'ORDER-1', amount: 150000 },
  transaction: { status: 'SUCCESS', date: '2026-11-24T03:24:23Z' },
});

const makeService = (env: Record<string, string> = {}) =>
  new DokuService(
    new ConfigService({
      DOKU_CLIENT_ID: 'BRN-1',
      DOKU_SECRET_KEY: 'SK-test',
      ...env,
    }),
  );

// Built from DOKU's documented format, independently of the service code.
const signedHeaders = (secret = 'SK-test', clientId = 'BRN-1') => {
  const digest = createHash('sha256').update(BODY).digest('base64');
  const text = `Client-Id:${clientId}\nRequest-Id:req-1\nRequest-Timestamp:2026-11-24T03:24:30Z\nRequest-Target:${PATH}\nDigest:${digest}`;
  return {
    'client-id': clientId,
    'request-id': 'req-1',
    'request-timestamp': '2026-11-24T03:24:30Z',
    signature: `HMACSHA256=${createHmac('sha256', secret).update(text).digest('base64')}`,
  };
};

describe('DokuService', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('parseWebhook', () => {
    it('accepts a correctly signed notification', () => {
      const notify = makeService().parseWebhook(PATH, signedHeaders(), BODY);
      expect(notify.order?.invoice_number).toBe('ORDER-1');
    });

    it.each([
      ['tampered body', PATH, signedHeaders(), BODY.replace('150000', '1')],
      ['wrong path', '/other', signedHeaders(), BODY],
      ['wrong secret', PATH, signedHeaders('SK-other'), BODY],
      ['other client', PATH, signedHeaders('SK-test', 'BRN-2'), BODY],
      ['no headers', PATH, {}, BODY],
    ])('rejects %s', (_name, path, headers, body) => {
      expect(() => makeService().parseWebhook(path, headers, body)).toThrow();
    });

    it('rejects everything when the secret key is empty', () => {
      const service = makeService({ DOKU_SECRET_KEY: '' });
      expect(() => service.parseWebhook(PATH, signedHeaders(''), BODY)).toThrow(
        'DOKU_SECRET_KEY',
      );
    });
  });

  it('creates a QRIS-only checkout with a valid signature', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          response: { payment: { url: 'https://doku/pay', token_id: 'tok' } },
        }),
      ),
    );

    const order = await makeService().createOrder({
      orderId: 'ORDER-1',
      amount: 150000,
      returnUrl: 'https://app/user/payment?orderId=ORDER-1',
    });

    expect(order).toEqual({ referenceNo: 'tok', redirectUrl: 'https://doku/pay' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api-sandbox.doku.com/checkout/v1/payment');
    const body = init!.body as string;
    expect(JSON.parse(body).payment.payment_method_types).toEqual(['QRIS']);

    const h = init!.headers as Record<string, string>;
    const digest = createHash('sha256').update(body).digest('base64');
    const text = `Client-Id:BRN-1\nRequest-Id:${h['Request-Id']}\nRequest-Timestamp:${h['Request-Timestamp']}\nRequest-Target:/checkout/v1/payment\nDigest:${digest}`;
    expect(h.Signature).toBe(
      `HMACSHA256=${createHmac('sha256', 'SK-test').update(text).digest('base64')}`,
    );
  });

  it('throws when DOKU rejects the order', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response('{"error_messages":["bad"]}', { status: 400 }),
      );
    await expect(
      makeService().createOrder({ orderId: 'O', amount: 1, returnUrl: 'x' }),
    ).rejects.toThrow('400');
  });

  it('returns null when DOKU has no transaction for the order yet', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 404 }));
    expect(await makeService().queryPayment('ORDER-1')).toBeNull();
  });

  it.each([
    ['SUCCESS', 'SUCCESS'],
    ['PENDING', 'PENDING'],
    ['EXPIRED', 'EXPIRED'],
    ['FAILED', null],
    ['TIMEOUT', null],
    [undefined, null],
  ])('maps %s to %s', (status, expected) => {
    expect(DokuService.mapStatus(status)).toBe(expected);
  });
});
