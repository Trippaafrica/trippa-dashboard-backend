
import { Controller, Post, Body, Get, Query, HttpException, Req, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { WalletService } from './wallet.service';
import { supabase } from '../auth/supabase.client';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  // Endpoint to create wallet for a user (called after signup)
  @Post('create')
  async createWallet(@Body() body: { userId: string; paystackDetails: any }) {
    return this.walletService.createWalletForUser(body.userId, body.paystackDetails);
  }

  // Endpoint to get wallet details by userId (for frontend)
  @Get('by-user')
  async getWalletByUser(@Query('userId') userId: string) {
    const wallet = await this.walletService.getWalletByUserId(userId);
    if (!wallet) return { error: 'Wallet not found' };
    return wallet;
  }

  // Endpoint to credit wallet (called by webhook)
  @Post('credit')
  async creditWallet(@Body() body: { userId: string; amount: number }) {
    await this.walletService.creditWallet(body.userId, body.amount);
    return { success: true };
  }

  // Endpoint to debit wallet (called when placing order)
  @Post('debit')
  async debitWallet(@Body() body: { userId: string; amount: number }) {
    const success = await this.walletService.debitWallet(body.userId, body.amount);
    return { success };
  }

  // Endpoint to get wallet balance - supports both userId query param and API key/JWT authentication
  @Get('balance')
  async getWalletBalance(@Query('userId') userId?: string, @Req() req?) {
    // If userId is provided, use the original logic (for internal/admin use)
    if (userId) {
      const wallet = await this.walletService.getWalletByUserId(userId);
      if (!wallet) return { balance: 0 };
      return { balance: wallet.balance };
    }

    // Otherwise, authenticate via shopdomain, API key, or JWT token
    const apiKey = req?.headers['x-api-key'];
    const authHeader = req?.headers['authorization'];
    const shopdomain = req?.headers['shopdomain'] || req?.body?.shopdomain;

    if (shopdomain) {
      // Shopify integration: lookup business by shopdomain
      const { data: business, error } = await supabase
        .from('business')
        .select('id, wallet_balance')
        .eq('shopdomain', shopdomain)
        .single();
      if (error || !business?.id) {
        throw new BadRequestException('Invalid shopdomain or business not found');
      }
      // Convert from kobo to Naira for Shopify users
      const balanceInNaira = (business.wallet_balance || 0) / 100;
      return {
        balance: balanceInNaira,
        currency: 'NGN',
        businessId: business.id
      };
    } else if (apiKey) {
      // API key integration: lookup business by api_key
      const { data: business, error } = await supabase
        .from('business')
        .select('id, wallet_balance')
        .eq('api_key', apiKey)
        .single();
      if (error || !business?.id) {
        throw new BadRequestException('Invalid API key or business not found');
      }
      // Convert from kobo to Naira for API integrators
      const balanceInNaira = (business.wallet_balance || 0) / 100;
      return {
        balance: balanceInNaira,
        currency: 'NGN',
        businessId: business.id
      };
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      // Dashboard user: lookup business by supabase_user_id from token
      const token = authHeader.replace('Bearer ', '');
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userError || !userData?.user?.id) {
        throw new BadRequestException('Invalid or expired token');
      }
      const supabaseUserId = userData.user.id;
      const { data: business, error } = await supabase
        .from('business')
        .select('id, wallet_balance')
        .or(`supabase_user_id.eq.${supabaseUserId},id.eq.${supabaseUserId}`)
        .single();
      if (error || !business?.id) {
        throw new BadRequestException('Business not found for authenticated user');
      }
      // Convert from kobo to Naira for dashboard users too
      const balanceInNaira = (business.wallet_balance || 0) / 100;
      return {
        balance: balanceInNaira,
        currency: 'NGN',
        businessId: business.id
      };
    } else {
      throw new BadRequestException('Missing authentication: provide userId query param, shopdomain, x-api-key header, or Bearer token');
    }
  }

  // Public API endpoint to get wallet transaction history for API key authenticated users
  @Get('api/transactions')
  async getWalletTransactionsAPI(@Req() req, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    // Industry-standard business lookup
    let businessId: string | undefined;
    const apiKey = req.headers['x-api-key'];
    const authHeader = req.headers['authorization'];

    if (apiKey) {
      // API key integration: lookup business by api_key
      const { data: business, error } = await supabase
        .from('business')
        .select('id')
        .eq('api_key', apiKey)
        .single();
      
      if (error || !business?.id) {
        throw new BadRequestException('Invalid API key or business not found');
      }
      businessId = business.id;
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      // Dashboard user: lookup business by supabase_user_id from token
      const token = authHeader.replace('Bearer ', '');
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userError || !userData?.user?.id) {
        throw new BadRequestException('Invalid or expired token');
      }
      const supabaseUserId = userData.user.id;
      const { data: business, error } = await supabase
        .from('business')
        .select('id')
  .or(`supabase_user_id.eq.${supabaseUserId},id.eq.${supabaseUserId}`)
        .single();
      if (error || !business?.id) {
        throw new BadRequestException('Business not found for authenticated user');
      }
      businessId = business.id;
    } else {
      throw new BadRequestException('Missing authentication: provide x-api-key or Bearer token');
    }

    // Get transaction history with pagination
    const limitNum = limit ? parseInt(limit) : 50; // Default to 50 transactions
    const offsetNum = offset ? parseInt(offset) : 0;
    
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);
    
    if (error) {
      throw new HttpException('Failed to fetch transaction history', 500);
    }
    
    return { 
      transactions: data || [],
      businessId: businessId,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        count: data?.length || 0
      }
    };
  }

  // Endpoint to initiate wallet top-up (prepare for Paystack Pop)
  @Post('topup/initiate')
  async initiateTopup(@Body() body: { 
    amount: number; 
    callback_url?: string; 
    metadata: { email: string; phone?: string; userId: string; }
  }) {
    const { amount, callback_url, metadata } = body;
    
    if (!amount || !metadata?.email || !metadata?.userId) {
      throw new BadRequestException('Missing required fields: amount, metadata.email, metadata.userId');
    }

  // Always convert amount from Naira to kobo
  const amountInKobo = amount * 100;

    try {
      const paymentData = await this.walletService.initiateTopup(
        amountInKobo, 
        metadata, 
        callback_url
      );
      
      return {
        success: true,
        data: paymentData,
      };
    } catch (error) {
      throw new HttpException(error.message || 'Failed to initiate top-up', 500);
    }
  }

  // Endpoint to verify top-up/payment (e.g., after Paystack payment)
  @Post('topup/verify')
  async verifyTopup(@Body() body: { reference: string; userId: string }) {
    const { reference, userId } = body;
    if (!reference || !userId) return { error: 'Missing reference or userId' };

    // Verify with Paystack
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecret) throw new HttpException('Paystack secret key not set', 500);
    try {
      const verifyRes = await axios.get(
        `https://api.paystack.co/transaction/verify/${reference}`,
        { headers: { Authorization: `Bearer ${paystackSecret}` } }
      );
      const data = verifyRes.data?.data;
      if (verifyRes.data.status !== true || !data || data.status !== 'success') {
        return { error: 'Payment not successful' };
      }
      
      // Get the desired amount from metadata (amount user should receive in wallet)
      const desiredAmount = data.metadata?.desired_amount || data.amount;
      const paystackFee = data.metadata?.paystack_fee || (data.amount - desiredAmount);
      
      // Credit wallet with the desired amount (not the total amount paid)
      await this.walletService.creditWallet(
        userId, 
        desiredAmount, 
        reference, 
        `Wallet top-up via Paystack Pop (Fee: ₦${paystackFee / 100})`
      );
      
      return { 
        success: true,
        amount_credited: desiredAmount,
        paystack_fee: paystackFee,
        total_paid: data.amount
      };
    } catch (err) {
      throw new HttpException('Failed to verify payment with Paystack', 500);
    }
  }

  // Endpoint to preview top-up fees (useful for frontend to show fee breakdown)
  @Post('topup/preview')
  async previewTopupFees(@Body() body: { amount: number }) {
    const { amount } = body;
    
    if (!amount || amount <= 0) {
      throw new BadRequestException('Invalid amount provided');
    }

  // Always convert amount from Naira to kobo
  const amountInKobo = amount * 100;
    const finalAmount = this.walletService.calculatePaystackFinalAmount(amountInKobo);
    const paystackFee = finalAmount - amountInKobo;

    return {
      desired_amount: amountInKobo,
      paystack_fee: paystackFee,
      total_to_pay: finalAmount,
      breakdown: {
        desired_amount_ngn: amountInKobo / 100,
        paystack_fee_ngn: paystackFee / 100,
        total_to_pay_ngn: finalAmount / 100,
      }
    };
  }
  
  // Endpoint for Shopify users to generate Paystack payment link for wallet top-up
  @Post('topup/shopify-link')
  async generateShopifyTopupLink(@Body() body: { 
    amount: number;
    user_email: string;
  }, @Req() req) {
    const { amount, user_email } = body;
    const shopdomain = req?.headers['shopdomain'];
    if (!amount || !user_email || !shopdomain) {
      throw new BadRequestException('Missing required fields: amount (body), user_email (body), shopdomain (header)');
    }

    // Lookup business by shopdomain
    const { data: business, error } = await supabase
      .from('business')
      .select('id, business_name')
      .eq('shopdomain', shopdomain)
      .single();
    if (error || !business?.id) {
      throw new BadRequestException('Business not found for provided shopdomain');
    }

    // Always convert amount from Naira to kobo
    const amountInKobo = amount * 100;
    try {
        // Extract store name before '.myshopify.com'
        const storeName = shopdomain.replace(/\.myshopify\.com$/, '');
        const paymentData = await this.walletService.initiateTopup(
          amountInKobo,
          {
            email: user_email,
            userId: business.id,
            phone: '', // Optional for Shopify integration
          },
          `https://admin.shopify.com/store/${storeName}/apps/trippa/app/wallet?status=success`
        );
      return {
        success: true,
        payment_url: paymentData.authorization_url,
        reference: paymentData.reference,
        amount_breakdown: paymentData.fee_breakdown,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes
      };
    } catch (error) {
      throw new HttpException(error.message || 'Failed to generate payment link', 500);
    }
  }
  
  // Endpoint to get wallet transaction history by businessId
  @Get('transactions')
  async getWalletTransactions(@Query('businessId') businessId: string) {
    if (!businessId) return { error: 'Missing businessId' };
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });
    if (error) return { error: error.message };
    return { transactions: data };
  }

  // Admin endpoint to top-up a business wallet
  @Post('admin/top-up')
  async adminTopUpWallet(@Body() body: import('./dto/admin-topup.dto').AdminTopUpDto) {
    const { businessId, amount, reason, adminId } = body;
    if (!businessId || !amount || !reason) {
      throw new BadRequestException('Missing businessId, amount, or reason');
    }
    await this.walletService.creditWallet(businessId, amount * 100, null, `Admin Top-Up: ${reason}${adminId ? ` (by admin ${adminId})` : ''}`);
    const wallet = await this.walletService.getWalletByUserId(businessId);
    return { success: true, newBalance: wallet?.balance };
  }
}
