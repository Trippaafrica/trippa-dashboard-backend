import { Injectable, HttpException, Inject, forwardRef } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Wallet } from './wallet.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { supabase } from '../auth/supabase.client';

@Injectable()
export class WalletService {
  private readonly emailService = new EmailService();

  constructor(
    private readonly httpService: HttpService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Calculate the final amount to charge customer including Paystack fees.
   * Based on Paystack's fee structure for Nigeria-based businesses.
   * @param {number} price - The amount you want to receive (in kobo).
   * @returns {number} - The final amount to charge the customer (in kobo).
   */
  calculatePaystackFinalAmount(price: number): number {
    const decimalFee = 0.015; // 1.5% for local transactions in Nigeria
    const flatFee = price < 250000 ? 0 : 10000; // NGN 100 (10000 kobo) waived for transactions under NGN 2,500 (250000 kobo)
    const feeCap = 200000; // NGN 2,000 (200000 kobo) cap for local transactions

    // Calculate applicable fees
    const applicableFees = (decimalFee * price) + flatFee;

    let finalAmount: number;
    if (applicableFees > feeCap) {
      finalAmount = price + feeCap;
    } else {
      finalAmount = ((price + flatFee) / (1 - decimalFee)) + 1; // +1 kobo (equivalent to +0.01 NGN)
    }

    // Round up to the nearest kobo
    return Math.ceil(finalAmount);
  }

  /**
   * Initiate wallet top-up with Paystack
   * @param {number} desiredAmount - Amount user wants to receive in their wallet (in kobo)
   * @param {object} userDetails - User details for Paystack
   * @param {string} callbackUrl - Optional callback URL
   * @returns {object} - Paystack initialization data
   */
  async initiateTopup(desiredAmount: number, userDetails: { email: string; phone?: string; userId: string }, callbackUrl?: string): Promise<any> {
    // Calculate final amount including Paystack fees
    const finalAmount = this.calculatePaystackFinalAmount(desiredAmount);
    const paystackFee = finalAmount - desiredAmount;

    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecret) {
      throw new HttpException('Paystack secret key not configured', 500);
    }

    try {
      const initData = {
        email: userDetails.email,
        amount: finalAmount, // Amount in kobo including fees
        currency: 'NGN',
        callback_url: callbackUrl,
        metadata: {
          userId: userDetails.userId,
          phone: userDetails.phone,
          desired_amount: desiredAmount, // Store original amount user wanted
          paystack_fee: paystackFee, // Store the fee charged
        },
      };

      const response = await firstValueFrom(
        this.httpService.post('https://api.paystack.co/transaction/initialize', initData, {
          headers: {
            Authorization: `Bearer ${paystackSecret}`,
            'Content-Type': 'application/json',
          },
        })
      );

      if (!response.data?.status) {
        throw new HttpException('Failed to initialize Paystack transaction', 500);
      }

      // Return the initialization data with fee breakdown
      return {
        ...response.data.data,
        fee_breakdown: {
          desired_amount: desiredAmount,
          paystack_fee: paystackFee,
          total_amount: finalAmount,
        },
      };
    } catch (error) {
      console.error('Paystack initialization error:', error);
      throw new HttpException('Failed to initialize payment', 500);
    }
  }

  // Create wallet for user (no DVA, just wallet record)
  async createWalletForUser(userId: string, userDetails: { email: string; first_name?: string; last_name?: string }): Promise<Wallet> {
    // Only create a wallet record in DB, no Paystack DVA/customer
    // You may want to add more fields as needed
    return {
      id: 'generated-id',
      user_id: userId,
      balance: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  async creditWallet(userId: string, amount: number, reference?: string, description?: string): Promise<void> {
    // Fetch business from Supabase
    const { data: business, error } = await supabase
      .from('business')
      .select('wallet_balance')
      .eq('id', userId)
      .single();

    if (error || !business) {
      throw new Error('Business not found');
    }

    const newBalance = Number(business.wallet_balance || 0) + Number(amount);

    const { error: updateError } = await supabase
      .from('business')
      .update({ wallet_balance: newBalance })
      .eq('id', userId);

    if (updateError) {
      throw new Error('Failed to update wallet_balance');
    }

    // Always log the transaction
    const { error: txError } = await supabase
      .from('wallet_transactions')
      .insert([
        {
          business_id: userId,
          amount: Number(amount),
          type: 'credit',
          reference: reference || null,
          status: 'success',
          description: description || 'Wallet credited',
          created_at: new Date().toISOString(),
        },
      ]);
    if (txError) {
      // Log but do not throw, so wallet still gets credited
      console.error('Failed to insert wallet transaction:', txError);
    }
  }

  async debitWallet(userId: string, amount: number): Promise<boolean> {
    // Fetch business wallet and threshold
    const { data: business, error } = await supabase
      .from('business')
      .select('wallet_balance, wallet_threshold, email')
      .eq('id', userId)
      .single();
    if (error || !business) {
      console.error('Business not found for debitWallet:', error);
      return false;
    }
    const currentBalance = Number(business.wallet_balance || 0);
    if (currentBalance < amount) {
      console.log('currentBalance:', currentBalance);
      // Insufficient funds
      return false;
    }
    const newBalance = currentBalance - amount;
    const { error: updateError } = await supabase
      .from('business')
      .update({ wallet_balance: newBalance })
      .eq('id', userId);
    if (updateError) {
      console.error('Failed to update wallet_balance on debit:', updateError);
      return false;
    }
    // Log the transaction
    const { error: txError } = await supabase
      .from('wallet_transactions')
      .insert([
        {
          business_id: userId,
          amount: -Number(amount),
          type: 'debit',
          status: 'success',
          description: 'Wallet debited for logistics delivery cost',
          created_at: new Date().toISOString(),
        },
      ]);
    if (txError) {
      console.error('Failed to insert wallet debit transaction:', txError);
    }
    // After successful debit, notify if new balance is below user threshold
    const threshold = Number(business.wallet_threshold) || 500000; // fallback to 500,000 kobo if not set
    if (newBalance < threshold) {
      await this.notificationsService.createNotification(
        userId,
        'low_wallet_balance',
        `Your wallet balance is low (below ${threshold / 100} NGN). Please fund your wallet.`
      );
      // Send email notification
      if (business.email) {
        try {
          await this.emailService.sendLowWalletBalanceEmail(
            business.email,
            threshold / 100,
            newBalance / 100
          );
        } catch (emailError) {
          console.error('Failed to send low wallet balance email:', emailError);
        }
      }
    }
    return true;
  }

  async getWalletByUserId(userId: string): Promise<Wallet | null> {
    // Fetch business by supabase_user_id
    const { data: business, error } = await supabase
      .from('business')
      .select('id, wallet_balance')
      .eq('supabase_user_id', userId)
      .single();
    console.log('Supabase business lookup:', { userId, business, error });
    if (error || !business) {
      return null;
    }
    // Return wallet-like object
    return {
      id: business.id,
      balance: business.wallet_balance,
    } as Wallet;
  }
}
