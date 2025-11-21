import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateUserDto, UpdateUserRoleDto, UpdateUserStatusDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private supabaseService: SupabaseService) {}

  async getUser(requesterId: string, userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    // Get requester's organization
    const { data: requester } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', requesterId)
      .single();

    // Get target user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !user) {
      throw new NotFoundException('User not found');
    }

    // Verify same organization
    if (user.organization_id !== requester.organization_id) {
      throw new ForbiddenException('Access denied');
    }

    return this.formatUser(user);
  }

  async getMyProfile(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !user) {
      throw new NotFoundException('User not found');
    }

    return this.formatUser(user);
  }

  async getOrganizationUsers(requesterId: string, organizationId: string) {
    const supabase = this.supabaseService.getAdminClient();

    // Verify requester belongs to organization
    const { data: requester } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', requesterId)
      .single();

    if (requester.organization_id !== organizationId) {
      throw new ForbiddenException('Access denied');
    }

    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      return [];
    }

    return users.map((user) => this.formatUser(user));
  }

  async updateMyProfile(userId: string, updateDto: UpdateUserDto) {
    const supabase = this.supabaseService.getAdminClient();

    const updateData: any = {};
    if (updateDto.firstName) updateData.first_name = updateDto.firstName;
    if (updateDto.lastName) updateData.last_name = updateDto.lastName;
    if (updateDto.phone) updateData.phone = updateDto.phone;
    if (updateDto.avatarUrl) updateData.avatar_url = updateDto.avatarUrl;

    const { data: user, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new NotFoundException('User not found');
    }

    return this.formatUser(user);
  }

  async updateUserRole(
    requesterId: string,
    userId: string,
    updateDto: UpdateUserRoleDto,
  ) {
    const supabase = this.supabaseService.getAdminClient();

    // Get requester
    const { data: requester } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', requesterId)
      .single();

    // Only admins can change roles
    if (requester.role !== 'admin') {
      throw new ForbiddenException('Only admins can change user roles');
    }

    // Get target user
    const { data: targetUser } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', userId)
      .single();

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    // Verify same organization
    if (targetUser.organization_id !== requester.organization_id) {
      throw new ForbiddenException('Access denied');
    }

    // Prevent removing last admin
    if (targetUser.role === 'admin' && updateDto.role !== 'admin') {
      const { data: admins } = await supabase
        .from('users')
        .select('id')
        .eq('organization_id', requester.organization_id)
        .eq('role', 'admin');

      if (admins && admins.length <= 1) {
        throw new BadRequestException(
          'Cannot remove the last admin. Please assign another admin first.',
        );
      }
    }

    const { data: user, error } = await supabase
      .from('users')
      .update({ role: updateDto.role })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new NotFoundException('User not found');
    }

    return this.formatUser(user);
  }

  async updateUserStatus(
    requesterId: string,
    userId: string,
    updateDto: UpdateUserStatusDto,
  ) {
    const supabase = this.supabaseService.getAdminClient();

    // Get requester
    const { data: requester } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', requesterId)
      .single();

    // Only admins can change user status
    if (requester.role !== 'admin') {
      throw new ForbiddenException('Only admins can change user status');
    }

    // Get target user
    const { data: targetUser } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', userId)
      .single();

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    // Verify same organization
    if (targetUser.organization_id !== requester.organization_id) {
      throw new ForbiddenException('Access denied');
    }

    // Prevent deactivating self
    if (userId === requesterId) {
      throw new BadRequestException('Cannot deactivate your own account');
    }

    // Prevent deactivating last admin
    if (targetUser.role === 'admin' && !updateDto.isActive) {
      const { data: activeAdmins } = await supabase
        .from('users')
        .select('id')
        .eq('organization_id', requester.organization_id)
        .eq('role', 'admin')
        .eq('is_active', true);

      if (activeAdmins && activeAdmins.length <= 1) {
        throw new BadRequestException(
          'Cannot deactivate the last active admin.',
        );
      }
    }

    const { data: user, error } = await supabase
      .from('users')
      .update({ is_active: updateDto.isActive })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new NotFoundException('User not found');
    }

    return this.formatUser(user);
  }

  async deleteUser(requesterId: string, userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    // Get requester
    const { data: requester } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', requesterId)
      .single();

    // Only admins can delete users
    if (requester.role !== 'admin') {
      throw new ForbiddenException('Only admins can delete users');
    }

    // Get target user
    const { data: targetUser } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', userId)
      .single();

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    // Verify same organization
    if (targetUser.organization_id !== requester.organization_id) {
      throw new ForbiddenException('Access denied');
    }

    // Prevent deleting self
    if (userId === requesterId) {
      throw new BadRequestException('Cannot delete your own account');
    }

    // Prevent deleting last admin
    if (targetUser.role === 'admin') {
      const { data: admins } = await supabase
        .from('users')
        .select('id')
        .eq('organization_id', requester.organization_id)
        .eq('role', 'admin');

      if (admins && admins.length <= 1) {
        throw new BadRequestException(
          'Cannot delete the last admin. Please assign another admin first.',
        );
      }
    }

    const { error } = await supabase.from('users').delete().eq('id', userId);

    if (error) {
      throw new NotFoundException('User not found');
    }

    return { message: 'User deleted successfully' };
  }

  private formatUser(user: any) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      phone: user.phone,
      avatarUrl: user.avatar_url,
      isActive: user.is_active,
      isEmailVerified: user.is_email_verified,
      lastLoginAt: user.last_login_at,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      organizationId: user.organization_id,
    };
  }
}
