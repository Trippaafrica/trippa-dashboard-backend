import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto, CreateOrganizationDto, OrganizationResponseDto } from './dto/organization.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/types';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationsController {
  constructor(private organizationsService: OrganizationsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my organization' })
  @ApiResponse({ status: 200, type: OrganizationResponseDto })
  async getMyOrganization(@CurrentUser() user: any) {
    return this.organizationsService.getMyOrganization(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create organization for current user (Onboarding)' })
  @ApiResponse({ status: 201, type: OrganizationResponseDto })
  async createOrganization(
    @CurrentUser() user: any,
    @Body() createDto: CreateOrganizationDto,
  ) {
    return this.organizationsService.createOrganizationForUser(user.id, createDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization by ID' })
  @ApiResponse({ status: 200, type: OrganizationResponseDto })
  async getOrganization(@CurrentUser() user: any, @Param('id') id: string) {
    return this.organizationsService.getOrganization(user.id, id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update organization (Admin only)' })
  @ApiResponse({ status: 200, type: OrganizationResponseDto })
  async updateOrganization(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.updateOrganization(user.id, id, updateDto);
  }

  @Get(':id/stats')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get organization statistics (Admin only)' })
  async getOrganizationStats(@CurrentUser() user: any, @Param('id') id: string) {
    return this.organizationsService.getOrganizationStats(user.id, id);
  }
}
