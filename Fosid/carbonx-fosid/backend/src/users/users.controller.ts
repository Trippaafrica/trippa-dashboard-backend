import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import {
  UpdateUserDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
  UserResponseDto,
} from './dto/user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/types';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my profile' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async getMyProfile(@CurrentUser() user: any) {
    return this.usersService.getMyProfile(user.id);
  }

  @Put('me')
  @ApiOperation({ summary: 'Update my profile' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async updateMyProfile(
    @CurrentUser() user: any,
    @Body() updateDto: UpdateUserDto,
  ) {
    return this.usersService.updateMyProfile(user.id, updateDto);
  }

  @Get('organization/:organizationId')
  @ApiOperation({ summary: 'Get all users in organization' })
  @ApiResponse({ status: 200, type: [UserResponseDto] })
  async getOrganizationUsers(
    @CurrentUser() user: any,
    @Param('organizationId') organizationId: string,
  ) {
    return this.usersService.getOrganizationUsers(user.id, organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async getUser(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.getUser(user.id, id);
  }

  @Put(':id/role')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user role (Admin only)' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async updateUserRole(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateUserRoleDto,
  ) {
    return this.usersService.updateUserRole(user.id, id, updateDto);
  }

  @Put(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user status (Admin only)' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async updateUserStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateUserStatusDto,
  ) {
    return this.usersService.updateUserStatus(user.id, id, updateDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete user (Admin only)' })
  async deleteUser(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.deleteUser(user.id, id);
  }
}
