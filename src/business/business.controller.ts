import { Controller, Get, Patch, Body, Param, UseInterceptors, UploadedFile, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { supabase } from '../auth/supabase.client';
import { BusinessService } from './business.service';

@Controller('businesses')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  // Admin-only: Returns all businesses with their total deliveries (orders count)
  @Get('with-deliveries')
  async getBusinessesWithDeliveries() {
    // Get all businesses
    const { data: businesses, error: businessError } = await supabase
      .from('business')
      .select('*');
    if (businessError) throw businessError;

    // Get all orders (shipments)
    const { data: orders, error: orderError } = await supabase
      .from('order')
      .select('id, business_id');
    if (orderError) throw orderError;

    // Map businessId to total deliveries
    const deliveriesMap = {};
    for (const order of orders || []) {
      if (order.business_id) {
        deliveriesMap[order.business_id] = (deliveriesMap[order.business_id] || 0) + 1;
      }
    }

    // Attach totalDeliveries to each business
    const result = (businesses || []).map(biz => ({
      ...biz,
      totalDeliveries: deliveriesMap[biz.id] || 0,
    }));
    return result;
  }

  @Get()
  async getAllBusinesses() {
    const { data, error } = await supabase
      .from('business')
      .select('*');
    if (error) throw error;
    return data;
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('profile_image'))
  async updateBusiness(
    @Param('id') id: string,
    @Body() updateDto: any,
    @UploadedFile() file?: Express.Multer.File,
    @Req() req?: any
  ) {
    return this.businessService.updateBusinessWithGlovoAddressBook(id, updateDto, file);
  }
}
