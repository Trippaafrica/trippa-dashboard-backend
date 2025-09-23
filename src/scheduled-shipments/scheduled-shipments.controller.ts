import { Controller, Get, Post, Put, Body, Param, Query, Req } from '@nestjs/common';
import { ScheduledShipmentsService } from './scheduled-shipments.service';
import { CreateScheduledShipmentDto } from './dto/create-scheduled-shipment.dto';

@Controller('scheduled-shipments')
export class ScheduledShipmentsController {
  constructor(private readonly scheduledShipmentsService: ScheduledShipmentsService) {}

  @Post()
  async createScheduledShipment(
    @Body() createScheduledShipmentDto: CreateScheduledShipmentDto,
    @Req() req: any
  ) {
    try {
      // --- AUTHENTICATION BLOCK (copied from OrderController) ---
      // Unified business lookup: shopdomain, API key, or JWT
      const apiKey = req.headers['x-api-key'];
      const authHeader = req.headers['authorization'];
      const shopdomain = req.headers['shopdomain'] || createScheduledShipmentDto.shopdomain;
      let businessId: string | undefined;

      if (shopdomain) {
        // Shopify integration: lookup business by shopdomain
        const { data: business, error } = await require('../auth/supabase.client').supabase
          .from('business')
          .select('id')
          .eq('shopdomain', shopdomain)
          .single();
        if (error || !business?.id) {
          return { success: false, message: 'Invalid shopdomain or business not found' };
        }
        businessId = business.id;
      } else if (apiKey) {
        // API key integration: lookup business by api_key
        const { data: business, error } = await require('../auth/supabase.client').supabase
          .from('business')
          .select('id')
          .eq('api_key', apiKey)
          .single();
        if (error || !business?.id) {
          return { success: false, message: 'Invalid API key or business not found' };
        }
        businessId = business.id;
      } else if (authHeader && authHeader.startsWith('Bearer ')) {
        // Dashboard user: lookup business by supabase_user_id from token
        const token = authHeader.replace('Bearer ', '');
        const { data: userData, error: userError } = await require('../auth/supabase.client').supabase.auth.getUser(token);
        if (userError || !userData?.user?.id) {
          return { success: false, message: 'Invalid or expired token' };
        }
        const supabaseUserId = userData.user.id;
        const { data: business, error } = await require('../auth/supabase.client').supabase
          .from('business')
          .select('id')
          .or(`supabase_user_id.eq.${supabaseUserId},id.eq.${supabaseUserId}`)
          .single();
        if (error || !business?.id) {
          return { success: false, message: 'Business not found for authenticated user' };
        }
        businessId = business.id;
      } else {
        return { success: false, message: 'Missing authentication: provide shopdomain, x-api-key, or Bearer token' };
      }

      // Use trippa_id from orderData if available, fallback to null
      const trippaId = createScheduledShipmentDto.request?.trippa_id || null;
      const scheduledShipment = await this.scheduledShipmentsService.createScheduledShipment(
        businessId,
        createScheduledShipmentDto.request,
        createScheduledShipmentDto.scheduledDate ? new Date(createScheduledShipmentDto.scheduledDate) : undefined,
        createScheduledShipmentDto.partner,
        createScheduledShipmentDto.partnerId,
        trippaId,
        { price: createScheduledShipmentDto.quote?.price }
      );
      return {
        success: true,
        message: 'Scheduled shipment created successfully',
        data: scheduledShipment
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to create scheduled shipment'
      };
    }
  }

    @Get()
  async getScheduledShipments(
    @Req() req,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('status') status?: string,
    @Query('search') search?: string
  ) {
    // Get businessId from headers (set by frontend) - same pattern as DeliveriesController
    const businessId = req.headers['x-business-id'];
    if (!businessId) {
      return { data: [], page, limit, total: 0, error: 'Missing businessId' };
    }
    
    const options = {
      page: page || 1,
      limit: limit || 10,
      status,
      search
    };

    try {
      return await this.scheduledShipmentsService.getScheduledShipments(businessId, options);
    } catch (error) {
      return { data: [], page, limit, total: 0, error: error.message || 'Failed to fetch scheduled shipments' };
    }
  }

  @Get(':id')
  async getScheduledShipmentById(
    @Req() req,
    @Param('id') id: string
  ) {
    // Get businessId from headers (set by frontend) - same pattern as DeliveriesController
    const businessId = req.headers['x-business-id'];
    if (!businessId) {
      return { success: false, message: 'Missing businessId' };
    }
    
    try {
      const scheduledShipment = await this.scheduledShipmentsService.getScheduledShipmentById(id, businessId);
      
      return {
        success: true,
        data: scheduledShipment
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to retrieve scheduled shipment'
      };
    }
  }

  @Put(':id/cancel')
  async cancelScheduledShipment(
    @Req() req,
    @Param('id') id: string
  ) {
    // Get businessId from headers (set by frontend) - same pattern as DeliveriesController
    const businessId = req.headers['x-business-id'];
    if (!businessId) {
      return { success: false, message: 'Missing businessId' };
    }
    
    try {
      await this.scheduledShipmentsService.cancelScheduledShipment(id, businessId);
      
      return {
        success: true,
        message: 'Scheduled shipment cancelled successfully and refund processed'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to cancel scheduled shipment'
      };
    }
  }
}
