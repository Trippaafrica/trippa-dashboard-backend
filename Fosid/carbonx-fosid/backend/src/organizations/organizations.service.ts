import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateOrganizationDto, CreateOrganizationDto } from './dto/organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private supabaseService: SupabaseService) {}

  async getOrganization(userId: string, organizationId: string) {
    const supabase = this.supabaseService.getAdminClient();

    // Verify user belongs to organization
    const { data: user } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', userId)
      .single();

    if (user.organization_id !== organizationId) {
      throw new ForbiddenException('Access denied');
    }

    const { data: organization, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .single();

    if (error || !organization) {
      throw new NotFoundException('Organization not found');
    }

    return this.formatOrganization(organization);
  }

  async getMyOrganization(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', userId)
      .single();

    if (!user || !user.organization_id) {
      throw new NotFoundException('Organization not found');
    }

    return this.getOrganization(userId, user.organization_id);
  }

  /**
   * Create organization for a user during onboarding
   * Called after user signs up and logs in, during the onboarding process
   */
  async createOrganizationForUser(userId: string, createDto: CreateOrganizationDto) {
    const supabase = this.supabaseService.getAdminClient();

    // Check if user already has an organization
    const { data: user } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', userId)
      .single();

    if (user.organization_id) {
      throw new BadRequestException('User already has an organization');
    }

    // Create organization
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: createDto.name,
        industry: createDto.industry,
        size: createDto.size,
        country: createDto.country,
        city: createDto.city,
        headquarters: createDto.headquarters,
        website: createDto.website,
        description: createDto.description,
      })
      .select()
      .single();

    if (orgError) {
      throw new BadRequestException('Failed to create organization');
    }

    // Update user with organization_id and upgrade to admin
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({
        organization_id: organization.id,
        role: 'admin', // User becomes admin of their own organization
      })
      .eq('id', userId);

    if (userUpdateError) {
      // Rollback: delete organization
      await supabase.from('organizations').delete().eq('id', organization.id);
      throw new BadRequestException('Failed to link organization to user');
    }

    return this.formatOrganization(organization);
  }

  async updateOrganization(
    userId: string,
    organizationId: string,
    updateDto: UpdateOrganizationDto,
  ) {
    const supabase = this.supabaseService.getAdminClient();

    // Verify user is admin of organization
    const { data: user } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', userId)
      .single();

    if (user.organization_id !== organizationId || user.role !== 'admin') {
      throw new ForbiddenException('Only admins can update organization');
    }

    const updateData: any = {};
    if (updateDto.name) updateData.name = updateDto.name;
    if (updateDto.industry) updateData.industry = updateDto.industry;
    if (updateDto.size) updateData.size = updateDto.size;
    if (updateDto.country) updateData.country = updateDto.country;
    if (updateDto.city) updateData.city = updateDto.city;
    if (updateDto.address) updateData.address = updateDto.address;
    if (updateDto.website) updateData.website = updateDto.website;
    if (updateDto.logoUrl) updateData.logo_url = updateDto.logoUrl;

    const { data: organization, error } = await supabase
      .from('organizations')
      .update(updateData)
      .eq('id', organizationId)
      .select()
      .single();

    if (error) {
      throw new NotFoundException('Organization not found');
    }

    return this.formatOrganization(organization);
  }

  async getOrganizationStats(userId: string, organizationId: string) {
    const supabase = this.supabaseService.getAdminClient();

    // Verify user belongs to organization
    const { data: user } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', userId)
      .single();

    if (user.organization_id !== organizationId) {
      throw new ForbiddenException('Access denied');
    }

    // Get user counts by role
    const { data: users } = await supabase
      .from('users')
      .select('role, is_active')
      .eq('organization_id', organizationId);

    const stats = {
      totalUsers: users?.length || 0,
      activeUsers: users?.filter((u) => u.is_active).length || 0,
      admins: users?.filter((u) => u.role === 'admin').length || 0,
      auditors: users?.filter((u) => u.role === 'auditor').length || 0,
      regularUsers: users?.filter((u) => u.role === 'user').length || 0,
    };

    // Get pending invitations
    const { data: invitations } = await supabase
      .from('invitations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('status', 'pending');

    stats['pendingInvitations'] = invitations?.length || 0;

    return stats;
  }

  private formatOrganization(org: any) {
    return {
      id: org.id,
      name: org.name,
      industry: org.industry,
      size: org.size,
      country: org.country,
      city: org.city,
      address: org.address,
      website: org.website,
      logoUrl: org.logo_url,
      subscriptionPlan: org.subscription_plan,
      subscriptionStatus: org.subscription_status,
      createdAt: org.created_at,
      updatedAt: org.updated_at,
    };
  }
}
