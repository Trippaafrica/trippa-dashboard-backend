import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto, InvitationResponseDto } from './dto/invitation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, Public } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/types';

@ApiTags('Invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private invitationsService: InvitationsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create invitation (Admin only)' })
  @ApiResponse({ status: 201, type: InvitationResponseDto })
  async createInvitation(
    @CurrentUser() user: any,
    @Body() createDto: CreateInvitationDto,
  ) {
    return this.invitationsService.createInvitation(user.id, createDto);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all invitations for organization (Admin only)' })
  @ApiResponse({ status: 200, type: [InvitationResponseDto] })
  async getOrganizationInvitations(@CurrentUser() user: any) {
    return this.invitationsService.getOrganizationInvitations(user.id);
  }

  @Get('pending')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get pending invitations (Admin only)' })
  @ApiResponse({ status: 200, type: [InvitationResponseDto] })
  async getPendingInvitations(@CurrentUser() user: any) {
    return this.invitationsService.getPendingInvitations(user.id);
  }

  @Public()
  @Get('verify')
  @ApiOperation({ summary: 'Verify invitation token' })
  async getInvitationByToken(@Query('token') token: string) {
    return this.invitationsService.getInvitationByToken(token);
  }

  @Post(':id/resend')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Resend invitation (Admin only)' })
  @ApiResponse({ status: 200, type: InvitationResponseDto })
  async resendInvitation(@CurrentUser() user: any, @Param('id') id: string) {
    return this.invitationsService.resendInvitation(user.id, id);
  }

  @Post(':id/revoke')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Revoke invitation (Admin only)' })
  async revokeInvitation(@CurrentUser() user: any, @Param('id') id: string) {
    return this.invitationsService.revokeInvitation(user.id, id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete invitation (Admin only)' })
  async deleteInvitation(@CurrentUser() user: any, @Param('id') id: string) {
    return this.invitationsService.deleteInvitation(user.id, id);
  }
}
