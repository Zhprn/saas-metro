import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as midtrans from 'midtrans-client';

@Injectable()
export class MidtransService {
  private snap: midtrans.Snap;
  private readonly logger = new Logger(MidtransService.name);

  constructor(private configService: ConfigService) {
    const isProduction =
      this.configService.get('MIDTRANS_IS_PRODUCTION') === 'true';

    this.snap = new midtrans.Snap({
      isProduction,
      serverKey: this.configService.get('MIDTRANS_SERVER_KEY'),
      clientKey: this.configService.get('MIDTRANS_CLIENT_KEY'),
    });

    this.logger.log(
      `Midtrans initialized in ${isProduction ? 'PRODUCTION' : 'SANDBOX'} mode`,
    );
  }

  async createTransaction(params: {
    orderId: string;
    amount: number;
    customerDetails: {
      firstName: string;
      email: string;
      phone?: string;
    };
    itemDetails: {
      id: string;
      name: string;
      price: number;
      quantity: number;
    }[];
  }) {
    const transactionDetails = {
      transaction_details: {
        order_id: params.orderId,
        gross_amount: params.amount,
      },
      customer_details: {
        first_name: params.customerDetails.firstName,
        email: params.customerDetails.email,
        phone: params.customerDetails.phone || '',
      },
      item_details: params.itemDetails,
    };

    const transaction = await this.snap.createTransaction(transactionDetails);

    return {
      token: transaction.token,
      redirect_url: transaction.redirect_url,
    };
  }

  async getTransactionStatus(orderId: string) {
    const coreApi = new midtrans.CoreApi({
      isProduction: this.configService.get('MIDTRANS_IS_PRODUCTION') === 'true',
      serverKey: this.configService.get('MIDTRANS_SERVER_KEY'),
      clientKey: this.configService.get('MIDTRANS_CLIENT_KEY'),
    });

    return coreApi.transaction.status(orderId);
  }

  getClientKey() {
    return this.configService.get('MIDTRANS_CLIENT_KEY');
  }
}
