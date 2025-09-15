import { Controller, Post, Body, BadRequestException, Req } from '@nestjs/common';
import { LogisticsAggregatorService } from '../logistics/aggregator.service';
import { UnifiedQuoteRequest } from '../logistics/types';
import { GeocodeService } from '../utils/geocode.service';
import { supabase } from '../auth/supabase.client';
import { AppLogger } from '../utils/logger.service';

@Controller('quotes')
export class QuotesController {
  private readonly logger = new AppLogger(QuotesController.name);

  constructor(
    private aggregator: LogisticsAggregatorService,
    private geocodeService: GeocodeService,
  ) {}

  @Post()
  async getQuotes(@Body() request: UnifiedQuoteRequest, @Req() req) {
    // Validate request structure
    if (!request?.pickup || !request?.delivery || !request?.item) {
      this.logger.error('QuotesController.getQuotes - Invalid request structure', {
        request,
        headers: req.headers,
      });
      throw new BadRequestException('Malformed request: missing pickup, delivery, or item fields.');
    }
  // Log the incoming request body for debugging
  this.logger.logApiAuth('QuotesController.getQuotes - incoming request body', JSON.stringify(request));
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
      // Logging for debugging
      this.logger.logApiAuth(`API key authentication`, { apiKey: apiKey?.substring(0, 10) + '...', businessFound: !!business?.id });
      if (error || !business?.id) {
        this.logger.error('Invalid API key or business not found', error);
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
        .eq('supabase_user_id', supabaseUserId)
        .single();
      if (error || !business?.id) {
        throw new BadRequestException('Business not found for authenticated user');
      }
      businessId = business.id;
    } else {
      throw new BadRequestException('Missing authentication: provide x-api-key or Bearer token');
    }
    // Inject businessId into meta
    request.meta = { ...(request.meta || {}), businessId };

    // Fetch wallet balance for business
    const { data: businessWallet, error: walletError } = await supabase
      .from('business')
      .select('wallet_balance')
      .eq('id', businessId)
      .single();
    if (walletError || !businessWallet) {
      throw new BadRequestException('Could not fetch wallet balance for business');
    }
    const walletBalance = Number(businessWallet.wallet_balance || 0);

    // Debug log for isDocument
    if (request?.item?.isDocument !== undefined) {
      this.logger.logApiAuth('Received isDocument in quote request', { isDocument: request.item.isDocument });
    }

    const requestWithCoords = await this.geocodeService.addCoordinatesToRequest(request);
    // Pass walletBalance to aggregator
    return this.aggregator.getQuotes(requestWithCoords, walletBalance);
  }
}
