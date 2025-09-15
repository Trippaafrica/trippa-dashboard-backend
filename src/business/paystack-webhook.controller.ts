import { supabase } from '../auth/supabase.client';
import { Controller, Post, Headers, Body, Req, Res, HttpException } from '@nestjs/common';
import { Request, Response } from 'express';
import { WalletService } from './wallet.service';
import { WalletGateway } from './wallet.gateway';
import { AppLogger } from '../utils/logger.service';
import * as crypto from 'crypto';

@Controller('paystack/webhook')
export class PaystackWebhookController {
  private readonly logger = new AppLogger(PaystackWebhookController.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly walletGateway: WalletGateway
  ) {}

  @Post()
  async handlePaystackWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    this.logger.logWebhook('Paystack webhook called', req.body);
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const hash = crypto.createHmac('sha512', secret!).update(JSON.stringify(req.body)).digest('hex');
    if (hash !== signature) {
      this.logger.warn(`Invalid Paystack signature: ${signature}`);
      return res.status(401).send('Invalid signature');
    }

    const event = req.body;
    this.logger.logWebhook('Event received', { event: event.event });
    if (event.event === 'charge.success') {
      // supabaseUserId is inside event.data.customer.metadata.supabaseUserId
      const customer = event.data.customer || {};
      const customerMetadata = customer.metadata || {};
      const supabaseUserId = customerMetadata.supabaseUserId || customerMetadata.businessId; // fallback for legacy
      const amount = event.data.amount; // Amount in kobo
      console.log('[Webhook] charge.success event:', { supabaseUserId, amount, customerMetadata });
      if (supabaseUserId && amount) {
        try {
          // Fetch current balance
          const { data: business, error: fetchError } = await supabase
            .from('business')
            .select('id, wallet_balance')
            .eq('supabase_user_id', supabaseUserId)
            .single();
          if (fetchError || !business) {
            console.error('[Webhook] Business not found:', { supabaseUserId, fetchError });
            throw new Error('Business not found');
          }
          console.log('[Webhook] Current wallet_balance:', business.wallet_balance);
          const newBalance = Number(business.wallet_balance || 0) + Number(amount);
          // Update balance
          const { error: updateError } = await supabase
            .from('business')
            .update({ wallet_balance: newBalance })
            .eq('id', business.id);
          if (updateError) {
            console.error('[Webhook] Failed to update wallet_balance:', updateError);
            throw new Error('Failed to update wallet_balance');
          }
          console.log('[Webhook] Wallet balance updated for business:', business.id, 'amount:', amount, 'newBalance:', newBalance);

          // Emit websocket event for real-time update
          if (supabaseUserId) {
            this.walletGateway.sendWalletUpdate(supabaseUserId, newBalance);
          }

          // Insert transaction record
          const { error: txError } = await supabase
            .from('wallet_transactions')
            .insert([
              {
                business_id: business.id,
                amount: Number(amount),
                type: 'credit',
                reference: event.data.reference,
                status: 'success',
                description: 'Wallet top-up via Paystack',
                created_at: new Date().toISOString(),
              },
            ]);
          if (txError) {
            console.error('[Webhook] Failed to insert wallet transaction:', txError);
          } else {
            console.log('[Webhook] Wallet transaction recorded for business:', business.id);
          }
        } catch (err) {
          console.error('[Webhook] Failed to credit wallet:', err);
          throw new HttpException('Failed to credit wallet', 500);
        }
      } else {
        console.warn('[Webhook] Missing userId or amount in webhook payload:', req.body);
      }
    } else {
      console.log('[Webhook] Unhandled Paystack event:', event.event);
    }
    return res.status(200).send('ok');
  }
}
