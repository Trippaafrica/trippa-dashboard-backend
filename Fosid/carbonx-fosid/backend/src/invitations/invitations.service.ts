import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateInvitationDto } from './dto/invitation.dto';

@Injectable()
export class InvitationsService {
  constructor(private supabaseService: SupabaseService) {}

  async createInvitation(userId: string, createDto: CreateInvitationDto) {
    const supabase = this.supabaseService.getAdminClient();

    // Get user's organization and verify admin role
    const { data: user } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', userId)
      .single();

    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('Only admins can invite users');
    }

    // Check if email already exists in organization
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', createDto.email)
      .eq('organization_id', user.organization_id)
      .single();

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Check for existing pending invitation
    const { data: existingInvite } = await supabase
      .from('invitations')
      .select('id, status')
      .eq('email', createDto.email)
      .eq('organization_id', user.organization_id)
      .single();

    if (existingInvite) {
      if (existingInvite.status === 'pending') {
        throw new ConflictException('Invitation already sent to this email');
      }
      // Delete old invitation if not pending
      await supabase.from('invitations').delete().eq('id', existingInvite.id);
    }

    // Create invitation token
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

    const { data: invitation, error } = await supabase
      .from('invitations')
      .insert({
        organization_id: user.organization_id,
        email: createDto.email,
        role: createDto.role,
        invited_by: userId,
        token,
        expires_at: expiresAt.toISOString(),
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException('Failed to create invitation');
    }

    // TODO: Send invitation email
    const inviteLink = `${process.env.FRONTEND_URL}/accept-invitation?token=${token}`;
    console.log(`Invitation link for ${createDto.email}: ${inviteLink}`);

    return this.formatInvitation(invitation);
  }

  async getOrganizationInvitations(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    // Get user's organization
    const { data: user } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', userId)
      .single();

    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('Only admins can view invitations');
    }

    const { data: invitations, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('organization_id', user.organization_id)
      .order('created_at', { ascending: false });

    if (error) {
      return [];
    }

    return invitations.map((invite) => this.formatInvitation(invite));
  }

  async getPendingInvitations(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    // Get user's organization
    const { data: user } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', userId)
      .single();

    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('Only admins can view invitations');
    }

    const { data: invitations, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('organization_id', user.organization_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      return [];
    }

    return invitations.map((invite) => this.formatInvitation(invite));
  }

  async getInvitationByToken(token: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: invitation, error } = await supabase
      .from('invitations')
      .select('*, organizations(name)')
      .eq('token', token)
      .single();

    if (error || !invitation) {
      throw new NotFoundException('Invitation not found');
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from('invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);

      throw new BadRequestException('Invitation has expired');
    }

    if (invitation.status !== 'pending') {
      throw new BadRequestException(
        `Invitation is ${invitation.status}`,
      );
    }

    return {
      ...this.formatInvitation(invitation),
      organizationName: invitation.organizations?.name,
    };
  }

  async resendInvitation(userId: string, invitationId: string) {
    const supabase = this.supabaseService.getAdminClient();

    // Get user's organization
    const { data: user } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', userId)
      .single();

    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('Only admins can resend invitations');
    }

    // Get invitation
    const { data: invitation } = await supabase
      .from('invitations')
      .select('*')
      .eq('id', invitationId)
      .single();

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.organization_id !== user.organization_id) {
      throw new ForbiddenException('Access denied');
    }

    if (invitation.status !== 'pending') {
      throw new BadRequestException('Can only resend pending invitations');
    }

    // Extend expiration
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + 7);

    const { data: updatedInvitation, error } = await supabase
      .from('invitations')
      .update({ expires_at: newExpiresAt.toISOString() })
      .eq('id', invitationId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException('Failed to resend invitation');
    }

    // TODO: Resend invitation email
    const inviteLink = `${process.env.FRONTEND_URL}/accept-invitation?token=${invitation.token}`;
    console.log(`Resent invitation link: ${inviteLink}`);

    return this.formatInvitation(updatedInvitation);
  }

  async revokeInvitation(userId: string, invitationId: string) {
    const supabase = this.supabaseService.getAdminClient();

    // Get user's organization
    const { data: user } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', userId)
      .single();

    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('Only admins can revoke invitations');
    }

    // Get invitation
    const { data: invitation } = await supabase
      .from('invitations')
      .select('organization_id')
      .eq('id', invitationId)
      .single();

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.organization_id !== user.organization_id) {
      throw new ForbiddenException('Access denied');
    }

    const { error } = await supabase
      .from('invitations')
      .update({ status: 'revoked' })
      .eq('id', invitationId);

    if (error) {
      throw new BadRequestException('Failed to revoke invitation');
    }

    return { message: 'Invitation revoked successfully' };
  }

  async deleteInvitation(userId: string, invitationId: string) {
    const supabase = this.supabaseService.getAdminClient();

    // Get user's organization
    const { data: user } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', userId)
      .single();

    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('Only admins can delete invitations');
    }

    // Get invitation
    const { data: invitation } = await supabase
      .from('invitations')
      .select('organization_id')
      .eq('id', invitationId)
      .single();

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.organization_id !== user.organization_id) {
      throw new ForbiddenException('Access denied');
    }

    const { error } = await supabase
      .from('invitations')
      .delete()
      .eq('id', invitationId);

    if (error) {
      throw new BadRequestException('Failed to delete invitation');
    }

    return { message: 'Invitation deleted successfully' };
  }

  private formatInvitation(invitation: any) {
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      invitedBy: invitation.invited_by,
      expiresAt: invitation.expires_at,
      createdAt: invitation.created_at,
      organizationId: invitation.organization_id,
    };
  }
}
