import { Controller, Get } from '@nestjs/common';
import { ApiStatsService } from './api-stats.service';

@Controller('admin/api-stats')
export class ApiStatsController {
  constructor(private readonly apiStatsService: ApiStatsService) {}

  @Get()
  async getStats() {
    return this.apiStatsService.getStats();
  }
}
