import { Body, Controller, Post } from '@nestjs/common';

@Controller('gmail-webhook')
export class GmailWebhookController {
  @Post('webhook')
  async handle(@Body() body: any) {
    console.log('Received Gmail webhook:', body);
    // Handle the webhook payload as needed
    return { status: 'ok' };
  }
}
