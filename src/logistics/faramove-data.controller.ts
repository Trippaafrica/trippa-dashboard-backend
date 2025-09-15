import { Controller, Get, Post, HttpCode } from '@nestjs/common';
import { FaramoveDataService } from './cache/faramove-data.service';

@Controller('faramove/data')
export class FaramoveDataController {
  constructor(private faramoveDataService: FaramoveDataService) {}

  @Get('status')
  getCacheStatus() {
    return {
      success: true,
      data: this.faramoveDataService.getCacheStats(),
    };
  }

  @Get('states')
  getStates() {
    const states = this.faramoveDataService.getCache('states');
    if (!states) {
      return { success: false, message: 'States cache not loaded' };
    }
    
    // Convert Map to object for JSON response
    const statesObj = Object.fromEntries(states);
    return {
      success: true,
      data: statesObj,
      count: states.size,
    };
  }

  @Get('weight-ranges')
  getWeightRanges() {
    const weightRanges = this.faramoveDataService.getCache('weightRanges');
    if (!weightRanges) {
      return { success: false, message: 'Weight ranges cache not loaded' };
    }
    
    return {
      success: true,
      data: weightRanges,
      count: weightRanges.length,
    };
  }

  @Get('cities')
  getCities() {
    const cities = this.faramoveDataService.getCache('cities');
    if (!cities) {
      return { success: false, message: 'Cities cache not loaded' };
    }
    
    // Calculate total cities count
    const totalCities = Object.values(cities).reduce(
      (total: number, stateCities: any) => total + (stateCities?.length || 0),
      0
    );
    
    return {
      success: true,
      data: cities,
      statesCount: Object.keys(cities).length,
      totalCitiesCount: totalCities,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  async refreshCache() {
    try {
      await this.faramoveDataService.forceRefresh();
      return {
        success: true,
        message: 'Cache refreshed successfully',
        data: this.faramoveDataService.getCacheStats(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to refresh cache',
        error: error.message,
      };
    }
  }
}
