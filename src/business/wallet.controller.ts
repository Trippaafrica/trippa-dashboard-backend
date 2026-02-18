
// import { Controller, Post, Body, Get, Query, HttpException, Req, BadRequestException } from '@nestjs/common';
// import axios from 'axios';
// import { WalletService } from './wallet.service';
// import { supabase } from '../auth/supabase.client';

// @Controller('wallet')
// export class WalletController {
//   constructor(private readonly walletService: WalletService) {}

//   // Endpoint to create wallet for a user (called after signup)
//   @Post('create')
//   async createWallet(@Body() body: { userId: string; paystackDetails: any }) {
//     return this.walletService.createWalletForUser(body.userId, body.paystackDetails);
//   }

//   // Endpoint to get wallet details by userId (for frontend)
//   @Get('by-user')
//   async getWalletByUser(@Query('userId') userId: string) {
//     const wallet = await this.walletService.getWalletByUserId(userId);
//     if (!wallet) return { error: 'Wallet not found' };
//     return wallet;
//   }

//   // Endpoint to credit wallet (called by webhook)
//   @Post('credit')
//   async creditWallet(@Body() body: { userId: string; amount: number }) {
//     await this.walletService.creditWallet(body.userId, body.amount);
//     return { success: true };
//   }

//   // Endpoint to debit wallet (called when placing order)
//   @Post('debit')
//   async debitWallet(@Body() body: { userId: string; amount: number }) {
//     const success = await this.walletService.debitWallet(body.userId, body.amount);
//     return { success };
//   }

//   // Endpoint to get wallet balance - supports both userId query param and API key/JWT authentication
//   @Get('balance')
//   async getWalletBalance(@Query('userId') userId?: string, @Req() req?) {
//     // If userId is provided, use the original logic (for internal/admin use)
//     if (userId) {
//       const wallet = await this.walletService.getWalletByUserId(userId);
//       if (!wallet) return { balance: 0 };
//       return { balance: wallet.balance };
//     }

//     // Otherwise, authenticate via shopdomain, API key, or JWT token
//     const apiKey = req?.headers['x-api-key'];
//     const authHeader = req?.headers['authorization'];
//     const shopdomain = req?.headers['shopdomain'] || req?.body?.shopdomain;

//     if (shopdomain) {
//       // Shopify integration: lookup business by shopdomain
//       const { data: business, error } = await supabase
//         .from('business')
//         .select('id, wallet_balance')
//         .eq('shopdomain', shopdomain)
//         .single();
//       if (error || !business?.id) {
//         throw new BadRequestException('Invalid shopdomain or business not found');
//       }
//       // Convert from kobo to Naira for Shopify users
//       const balanceInNaira = (business.wallet_balance || 0) / 100;
//       return {
//         balance: balanceInNaira,
//         currency: 'NGN',
//         businessId: business.id
//       };
//     } else if (apiKey) {
//       // API key integration: lookup business by api_key
//       const { data: business, error } = await supabase
//         .from('business')
//         .select('id, wallet_balance')
//         .eq('api_key', apiKey)
//         .single();
//       if (error || !business?.id) {
//         throw new BadRequestException('Invalid API key or business not found');
//       }
//       // Convert from kobo to Naira for API integrators
//       const balanceInNaira = (business.wallet_balance || 0) / 100;
//       return {
//         balance: balanceInNaira,
//         currency: 'NGN',
//         businessId: business.id
//       };
//     } else if (authHeader && authHeader.startsWith('Bearer ')) {
//       // Dashboard user: lookup business by supabase_user_id from token
//       const token = authHeader.replace('Bearer ', '');
//       const { data: userData, error: userError } = await supabase.auth.getUser(token);
//       if (userError || !userData?.user?.id) {
//         throw new BadRequestException('Invalid or expired token');
//       }
//       const supabaseUserId = userData.user.id;
//       const { data: business, error } = await supabase
//         .from('business')
//         .select('id, wallet_balance')
//         .or(`supabase_user_id.eq.${supabaseUserId},id.eq.${supabaseUserId}`)
//         .single();
//       if (error || !business?.id) {
//         throw new BadRequestException('Business not found for authenticated user');
//       }
//       // Convert from kobo to Naira for dashboard users too
//       const balanceInNaira = (business.wallet_balance || 0) / 100;
//       return {
//         balance: balanceInNaira,
//         currency: 'NGN',
//         businessId: business.id
//       };
//     } else {
//       throw new BadRequestException('Missing authentication: provide userId query param, shopdomain, x-api-key header, or Bearer token');
//     }
//   }

//   // Public API endpoint to get wallet transaction history for API key authenticated users
//   @Get('api/transactions')
//   async getWalletTransactionsAPI(@Req() req, @Query('limit') limit?: string, @Query('offset') offset?: string) {
//     // Industry-standard business lookup
//     let businessId: string | undefined;
//     const apiKey = req.headers['x-api-key'];
//     const authHeader = req.headers['authorization'];

//     if (apiKey) {
//       // API key integration: lookup business by api_key
//       const { data: business, error } = await supabase
//         .from('business')
//         .select('id')
//         .eq('api_key', apiKey)
//         .single();
      
//       if (error || !business?.id) {
//         throw new BadRequestException('Invalid API key or business not found');
//       }
//       businessId = business.id;
//     } else if (authHeader && authHeader.startsWith('Bearer ')) {
//       // Dashboard user: lookup business by supabase_user_id from token
//       const token = authHeader.replace('Bearer ', '');
//       const { data: userData, error: userError } = await supabase.auth.getUser(token);
//       if (userError || !userData?.user?.id) {
//         throw new BadRequestException('Invalid or expired token');
//       }
//       const supabaseUserId = userData.user.id;
//       const { data: business, error } = await supabase
//         .from('business')
//         .select('id')
//   .or(`supabase_user_id.eq.${supabaseUserId},id.eq.${supabaseUserId}`)
//         .single();
//       if (error || !business?.id) {
//         throw new BadRequestException('Business not found for authenticated user');
//       }
//       businessId = business.id;
//     } else {
//       throw new BadRequestException('Missing authentication: provide x-api-key or Bearer token');
//     }

//     // Get transaction history with pagination
//     const limitNum = limit ? parseInt(limit) : 50; // Default to 50 transactions
//     const offsetNum = offset ? parseInt(offset) : 0;
    
//     const { data, error } = await supabase
//       .from('wallet_transactions')
//       .select('*')
//       .eq('business_id', businessId)
//       .order('created_at', { ascending: false })
//       .range(offsetNum, offsetNum + limitNum - 1);
    
//     if (error) {
//       throw new HttpException('Failed to fetch transaction history', 500);
//     }
    
//     return { 
//       transactions: data || [],
//       businessId: businessId,
//       pagination: {
//         limit: limitNum,
//         offset: offsetNum,
//         count: data?.length || 0
//       }
//     };
//   }

//   // Endpoint to initiate wallet top-up (prepare for Paystack Pop)
//   @Post('topup/initiate')
//   async initiateTopup(@Body() body: { 
//     amount: number; 
//     callback_url?: string; 
//     metadata: { email: string; phone?: string; userId: string; }
//   }) {
//     const { amount, callback_url, metadata } = body;
    
//     if (!amount || !metadata?.email || !metadata?.userId) {
//       throw new BadRequestException('Missing required fields: amount, metadata.email, metadata.userId');
//     }

//   // Always convert amount from Naira to kobo
//   const amountInKobo = amount * 100;

//     try {
//       const paymentData = await this.walletService.initiateTopup(
//         amountInKobo, 
//         metadata, 
//         callback_url
//       );
      
//       return {
//         success: true,
//         data: paymentData,
//       };
//     } catch (error) {
//       throw new HttpException(error.message || 'Failed to initiate top-up', 500);
//     }
//   }

//   // Endpoint to verify top-up/payment (e.g., after Paystack payment)
//   @Post('topup/verify')
//   async verifyTopup(@Body() body: { reference: string; userId: string }) {
//     const { reference, userId } = body;
//     if (!reference || !userId) return { error: 'Missing reference or userId' };

//     // Verify with Paystack
//     const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
//     if (!paystackSecret) throw new HttpException('Paystack secret key not set', 500);
//     try {
//       const verifyRes = await axios.get(
//         `https://api.paystack.co/transaction/verify/${reference}`,
//         { headers: { Authorization: `Bearer ${paystackSecret}` } }
//       );
//       const data = verifyRes.data?.data;
//       if (verifyRes.data.status !== true || !data || data.status !== 'success') {
//         return { error: 'Payment not successful' };
//       }
      
//       // Get the desired amount from metadata (amount user should receive in wallet)
//       const desiredAmount = data.metadata?.desired_amount || data.amount;
//       const paystackFee = data.metadata?.paystack_fee || (data.amount - desiredAmount);
      
//       // Credit wallet with the desired amount (not the total amount paid)
//       await this.walletService.creditWallet(
//         userId, 
//         desiredAmount, 
//         reference, 
//         `Wallet top-up via Paystack Pop (Fee: ₦${paystackFee / 100})`
//       );
      
//       return { 
//         success: true,
//         amount_credited: desiredAmount,
//         paystack_fee: paystackFee,
//         total_paid: data.amount
//       };
//     } catch (err) {
//       throw new HttpException('Failed to verify payment with Paystack', 500);
//     }
//   }

//   // Endpoint to preview top-up fees (useful for frontend to show fee breakdown)
//   @Post('topup/preview')
//   async previewTopupFees(@Body() body: { amount: number }) {
//     const { amount } = body;
    
//     if (!amount || amount <= 0) {
//       throw new BadRequestException('Invalid amount provided');
//     }

//   // Always convert amount from Naira to kobo
//   const amountInKobo = amount * 100;
//     const finalAmount = this.walletService.calculatePaystackFinalAmount(amountInKobo);
//     const paystackFee = finalAmount - amountInKobo;

//     return {
//       desired_amount: amountInKobo,
//       paystack_fee: paystackFee,
//       total_to_pay: finalAmount,
//       breakdown: {
//         desired_amount_ngn: amountInKobo / 100,
//         paystack_fee_ngn: paystackFee / 100,
//         total_to_pay_ngn: finalAmount / 100,
//       }
//     };
//   }
  
//   // Endpoint for Shopify users to generate Paystack payment link for wallet top-up
//   @Post('topup/shopify-link')
//   async generateShopifyTopupLink(@Body() body: { 
//     amount: number;
//     user_email: string;
//   }, @Req() req) {
//     const { amount, user_email } = body;
//     const shopdomain = req?.headers['shopdomain'];
//     if (!amount || !user_email || !shopdomain) {
//       throw new BadRequestException('Missing required fields: amount (body), user_email (body), shopdomain (header)');
//     }

//     // Lookup business by shopdomain
//     const { data: business, error } = await supabase
//       .from('business')
//       .select('id, business_name')
//       .eq('shopdomain', shopdomain)
//       .single();
//     if (error || !business?.id) {
//       throw new BadRequestException('Business not found for provided shopdomain');
//     }

//     // Always convert amount from Naira to kobo
//     const amountInKobo = amount * 100;
//     try {
//         // Extract store name before '.myshopify.com'
//         const storeName = shopdomain.replace(/\.myshopify\.com$/, '');
//         const paymentData = await this.walletService.initiateTopup(
//           amountInKobo,
//           {
//             email: user_email,
//             userId: business.id,
//             phone: '', // Optional for Shopify integration
//           },
//           `https://admin.shopify.com/store/${storeName}/apps/trippa/app/wallet?status=success`
//         );
//       return {
//         success: true,
//         payment_url: paymentData.authorization_url,
//         reference: paymentData.reference,
//         amount_breakdown: paymentData.fee_breakdown,
//         expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes
//       };
//     } catch (error) {
//       throw new HttpException(error.message || 'Failed to generate payment link', 500);
//     }
//   }
  
//   // Endpoint to get wallet transaction history by businessId
//   @Get('transactions')
//   async getWalletTransactions(@Query('businessId') businessId: string) {
//     if (!businessId) return { error: 'Missing businessId' };
//     const { data, error } = await supabase
//       .from('wallet_transactions')
//       .select('*')
//       .eq('business_id', businessId)
//       .order('created_at', { ascending: false });
//     if (error) return { error: error.message };
//     return { transactions: data };
//   }

//   // Admin endpoint to top-up a business wallet
//   @Post('admin/top-up')
//   async adminTopUpWallet(@Body() body: import('./dto/admin-topup.dto').AdminTopUpDto) {
//     const { businessId, amount, reason, adminId } = body;
//     if (!businessId || !amount || !reason) {
//       throw new BadRequestException('Missing businessId, amount, or reason');
//     }
//     await this.walletService.creditWallet(businessId, amount * 100, null, `Admin Top-Up: ${reason}${adminId ? ` (by admin ${adminId})` : ''}`);
//     const wallet = await this.walletService.getWalletByUserId(businessId);
//     return { success: true, newBalance: wallet?.balance };
//   }
// }





import { Controller, Post, Put, Body, Get, Query, HttpException, Req, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { WalletService } from './wallet.service';
import { supabase } from '../auth/supabase.client';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  private async verifyAdminToken(req: any): Promise<{ id: string | number; email?: string }> {
    const authHeader = req?.headers?.authorization || req?.headers?.Authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      throw new BadRequestException('Missing or invalid Authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      throw new BadRequestException('Invalid or expired admin token');
    }

    const { data: admins, error: adminError } = await supabase
      .from('admin')
      .select('id, email')
      .eq('supabase_user_id', userData.user.id)
      .limit(1);

    if (adminError || !admins || admins.length === 0) {
      throw new BadRequestException('Unauthorized: Admin access required');
    }

    return admins[0];
  }

  private async getCurrentUsdToNgnRate(): Promise<number> {
    const envRate = Number(process.env.SHOPIFY_USD_TO_NGN_RATE || 0);
    const fallbackRate = Number.isFinite(envRate) && envRate > 0 ? envRate : 1600;

    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'shopify_usd_to_ngn_rate')
        .single();

      if (!error && data?.value !== undefined && data?.value !== null) {
        const parsed = Number(data.value);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }

      return fallbackRate;
    } catch {
      return fallbackRate;
    }
  }

  private async resolveBusinessForShopifyRequest(req: any): Promise<{ id: string; shopdomain?: string }> {
    const explicitBusinessId = req?.headers?.['x-business-id'];
    if (explicitBusinessId) {
      const { data: byId } = await supabase
        .from('business')
        .select('id, shopdomain')
        .eq('id', explicitBusinessId)
        .single();
      if (byId?.id) return byId;
    }

    const authHeader = req?.headers?.authorization;
    const apiKeyHeader = req?.headers?.['x-api-key'];
    const shopdomainHeader = req?.headers?.shopdomain || req?.body?.shopdomain;

    if (authHeader && String(authHeader).startsWith('Bearer ')) {
      const token = String(authHeader).replace('Bearer ', '');
      const { data: byBearer } = await supabase
        .from('business')
        .select('id, shopdomain')
        .eq('api_key', token)
        .single();
      if (byBearer?.id) return byBearer;
    }

    if (apiKeyHeader) {
      const { data: byApiKey } = await supabase
        .from('business')
        .select('id, shopdomain')
        .eq('api_key', apiKeyHeader)
        .single();
      if (byApiKey?.id) return byApiKey;
    }

    if (shopdomainHeader) {
      const { data: byShopdomain } = await supabase
        .from('business')
        .select('id, shopdomain')
        .eq('shopdomain', shopdomainHeader)
        .single();
      if (byShopdomain?.id) return byShopdomain;
    }

    throw new BadRequestException('Unable to resolve Shopify business. Provide Authorization Bearer <apiKey>, x-api-key, shopdomain, or x-business-id.');
  }

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

    // Otherwise, authenticate via Authorization Bearer <apiKey>, x-api-key, shopdomain (fallback), or JWT token (dashboard)
    const apiKeyHeader = req?.headers['x-api-key'];
    const authHeader = req?.headers['authorization'];
    const shopdomain = req?.headers['shopdomain'] || req?.body?.shopdomain;

    // 1) Authorization: Bearer <apiKey> (Shopify/WooCommerce preferred)
    if (authHeader && String(authHeader).startsWith('Bearer ')) {
      const token = String(authHeader).replace('Bearer ', '');
      const { data: byKey } = await supabase
        .from('business')
        .select('id, wallet_balance')
        .eq('api_key', token)
        .single();
      if (byKey?.id) {
        const balanceInNaira = (byKey.wallet_balance || 0) / 100;
        return {
          balance: balanceInNaira,
          currency: 'NGN',
          businessId: byKey.id,
        };
      }
      // If not a valid api_key, we will try other mechanisms below (including treating token as JWT later)
    }

    // 2) x-api-key header
    if (apiKeyHeader) {
      const { data: business, error } = await supabase
        .from('business')
        .select('id, wallet_balance')
        .eq('api_key', apiKeyHeader)
        .single();
      if (error || !business?.id) {
        throw new BadRequestException('Invalid API key or business not found');
      }
      const balanceInNaira = (business.wallet_balance || 0) / 100;
      return {
        balance: balanceInNaira,
        currency: 'NGN',
        businessId: business.id,
      };
    }

    // 3) shopdomain fallback (Shopify/WooCommerce)
    if (shopdomain) {
      const { data: business, error } = await supabase
        .from('business')
        .select('id, wallet_balance')
        .eq('shopdomain', shopdomain)
        .single();
      if (error || !business?.id) {
        throw new BadRequestException('Invalid shopdomain or business not found');
      }
      const balanceInNaira = (business.wallet_balance || 0) / 100;
      return {
        balance: balanceInNaira,
        currency: 'NGN',
        businessId: business.id,
      };
    }

    // 4) Authorization: Bearer <JWT> (Dashboard users)
    if (authHeader && String(authHeader).startsWith('Bearer ')) {
      const token = String(authHeader).replace('Bearer ', '');
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
      const balanceInNaira = (business.wallet_balance || 0) / 100;
      return {
        balance: balanceInNaira,
        currency: 'NGN',
        businessId: business.id,
      };
    }

    throw new BadRequestException('Missing authentication: provide userId query param, Authorization Bearer <apiKey>, x-api-key, shopdomain, or Bearer <JWT>');
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
    if (!amount || !user_email) {
      throw new BadRequestException('Missing required fields: amount (body), user_email (body)');
    }

    // Resolve business via Authorization Bearer <apiKey>, x-api-key, or shopdomain (fallback)
    const authHeader = req?.headers['authorization'];
    const apiKeyHeader = req?.headers['x-api-key'];
    const shopdomainHeader = req?.headers['shopdomain'];

    let businessId: string | undefined;
    let shopdomain: string | undefined = undefined;

    // 1) Authorization: Bearer <apiKey>
    if (!businessId && authHeader && String(authHeader).startsWith('Bearer ')) {
      const token = String(authHeader).replace('Bearer ', '');
      const { data: byKey } = await supabase
        .from('business')
        .select('id, shopdomain')
        .eq('api_key', token)
        .single();
      if (byKey?.id) {
        businessId = byKey.id;
        shopdomain = byKey.shopdomain;
      }
    }

    // 2) x-api-key header
    if (!businessId && apiKeyHeader) {
      const { data: byKey, error } = await supabase
        .from('business')
        .select('id, shopdomain')
        .eq('api_key', apiKeyHeader)
        .single();
      if (error || !byKey?.id) {
        throw new BadRequestException('Invalid API key or business not found');
      }
      businessId = byKey.id;
      shopdomain = byKey.shopdomain;
    }

    // 3) shopdomain fallback
    if (!businessId && shopdomainHeader) {
      const { data: byShop, error } = await supabase
        .from('business')
        .select('id, shopdomain')
        .eq('shopdomain', shopdomainHeader)
        .single();
      if (error || !byShop?.id) {
        throw new BadRequestException('Business not found for provided shopdomain');
      }
      businessId = byShop.id;
      shopdomain = byShop.shopdomain;
    }

    if (!businessId || !shopdomain) {
      throw new BadRequestException('Missing authentication: provide Authorization Bearer <apiKey>, x-api-key, or shopdomain');
    }

    // Always convert amount from Naira to kobo
    const amountInKobo = amount * 100;
    try {
      // Extract store name before '.myshopify.com'
      const storeName = String(shopdomain).replace(/\.myshopify\.com$/, '');
      const paymentData = await this.walletService.initiateTopup(
        amountInKobo,
        {
          email: user_email,
          userId: businessId,
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

  // Admin endpoint: get current Shopify USD -> NGN conversion rate
  @Get('admin/shopify-usd-rate')
  async getShopifyUsdRate(@Req() req) {
    await this.verifyAdminToken(req);

    const envRate = Number(process.env.SHOPIFY_USD_TO_NGN_RATE || 0);
    const fallbackRate = Number.isFinite(envRate) && envRate > 0 ? envRate : 1600;

    const { data, error } = await supabase
      .from('system_settings')
      .select('value, updated_at, updated_by')
      .eq('key', 'shopify_usd_to_ngn_rate')
      .single();

    if (error) {
      return {
        rate: fallbackRate,
        source: 'fallback',
        key: 'shopify_usd_to_ngn_rate',
      };
    }

    const parsedRate = Number(data?.value);
    return {
      rate: Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : fallbackRate,
      source: 'database',
      key: 'shopify_usd_to_ngn_rate',
      updatedAt: data?.updated_at || null,
      updatedBy: data?.updated_by || null,
    };
  }

  // Admin endpoint: update Shopify USD -> NGN conversion rate
  @Put('admin/shopify-usd-rate')
  async updateShopifyUsdRate(@Req() req, @Body() body: { rate: number }) {
    const admin = await this.verifyAdminToken(req);
    const rate = Number(body?.rate);

    if (!Number.isFinite(rate) || rate <= 0) {
      throw new BadRequestException('Invalid rate. Provide a positive numeric value.');
    }

    const payload = {
      key: 'shopify_usd_to_ngn_rate',
      value: String(rate),
      description: 'Shopify USD to NGN wallet top-up conversion rate',
      updated_by: String(admin.id),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('system_settings')
      .upsert([payload], { onConflict: 'key' })
      .select('key, value, updated_at, updated_by')
      .single();

    if (error) {
      throw new HttpException(
        'Failed to persist Shopify USD rate. Ensure `system_settings` table exists and is accessible.',
        500,
      );
    }

    return {
      success: true,
      rate: Number(data?.value || rate),
      key: data?.key,
      updatedAt: data?.updated_at,
      updatedBy: data?.updated_by,
    };
  }

  // Shopify endpoint: credit wallet by converting USD charge amount to NGN using admin-configured rate
  @Post('credit-from-shopify')
  async creditFromShopify(
    @Req() req,
    @Body()
    body: {
      shopifyChargeId: string;
      amountUsd: number;
      currency?: string;
      chargeStatus?: string;
      createdAt?: string;
      test?: boolean;
    },
  ) {
    const { shopifyChargeId, amountUsd, currency = 'USD', chargeStatus, test } = body;

    if (!shopifyChargeId || typeof shopifyChargeId !== 'string') {
      throw new BadRequestException('shopifyChargeId is required');
    }

    const usdAmount = Number(amountUsd);
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      throw new BadRequestException('amountUsd must be a positive number');
    }

    if (String(currency).toUpperCase() !== 'USD') {
      throw new BadRequestException('Only USD currency is supported for Shopify credit conversion');
    }

    if (chargeStatus) {
      const normalizedStatus = String(chargeStatus).toLowerCase();
      const allowedStatuses = ['active', 'success', 'succeeded', 'paid'];
      if (!allowedStatuses.includes(normalizedStatus)) {
        throw new BadRequestException('Shopify charge is not in a payable/active status');
      }
    }

    const business = await this.resolveBusinessForShopifyRequest(req);
    const exchangeRate = await this.getCurrentUsdToNgnRate();
    const creditedNgn = usdAmount * exchangeRate;
    const creditedKobo = Math.round(creditedNgn * 100);
    const reference = `shopify_charge_${String(shopifyChargeId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    const { data: existingTx } = await supabase
      .from('wallet_transactions')
      .select('id, amount, created_at')
      .eq('business_id', business.id)
      .eq('reference', reference)
      .eq('type', 'credit')
      .eq('status', 'success')
      .limit(1);

    if (existingTx && existingTx.length > 0) {
      const { data: currentBusiness } = await supabase
        .from('business')
        .select('wallet_balance')
        .eq('id', business.id)
        .single();

      return {
        success: true,
        balance: Number(currentBusiness?.wallet_balance || 0),
        currency: 'NGN',
        credited: Number(existingTx[0].amount || creditedKobo),
        exchange_rate: exchangeRate,
        usd_amount: usdAmount,
        reference,
        idempotent: true,
      };
    }

    const description = `Shopify wallet credit (${test ? 'TEST' : 'LIVE'}): $${usdAmount} × ₦${exchangeRate}/USD`;
    await this.walletService.creditWallet(business.id, creditedKobo, reference, description);

    const { data: updatedBusiness, error: updatedBusinessError } = await supabase
      .from('business')
      .select('wallet_balance')
      .eq('id', business.id)
      .single();

    if (updatedBusinessError) {
      throw new HttpException('Wallet credited but failed to fetch updated balance', 500);
    }

    return {
      success: true,
      balance: Number(updatedBusiness?.wallet_balance || 0),
      currency: 'NGN',
      credited: creditedKobo,
      exchange_rate: exchangeRate,
      usd_amount: usdAmount,
      reference,
      idempotent: false,
    };
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
