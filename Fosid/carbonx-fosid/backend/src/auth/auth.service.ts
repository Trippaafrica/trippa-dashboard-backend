import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { SupabaseService } from '../supabase/supabase.service';
import {
  SignupDto,
  AdminSignupDto,
  LoginDto,
  AcceptInvitationDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  AuthResponseDto,
} from './dto/auth.dto';
import { JwtPayload, UserRole } from '../common/types';

@Injectable()
export class AuthService {
  constructor(
    private supabaseService: SupabaseService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async signup(signupDto: SignupDto): Promise<AuthResponseDto> {
    const supabase = this.supabaseService.getAdminClient();

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', signupDto.email)
      .single();

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(signupDto.password, 10);

    // Create user WITHOUT organization (no org assignment at signup)
    // Organization will be created during onboarding
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        email: signupDto.email,
        password_hash: passwordHash,
        first_name: signupDto.firstName,
        last_name: signupDto.lastName,
        phone: signupDto.phone,
        // organization_id is NULL until user creates organization in onboarding
        role: 'user', // Start as regular user, can upgrade to admin later
        is_active: true,
      })
      .select()
      .single();

    if (userError) {
      throw new BadRequestException('Failed to create user');
    }

    // Generate JWT token
    const accessToken = this.generateToken(user);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        organizationId: user.organization_id,
      },
    };
  }

  /**
   * Alternative signup flow: Admin registration with immediate organization creation
   * Useful for direct admin registration without onboarding step
   */
  async adminSignup(adminSignupDto: AdminSignupDto): Promise<AuthResponseDto> {
    const supabase = this.supabaseService.getAdminClient();

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', adminSignupDto.email)
      .single();

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(adminSignupDto.password, 10);

    // Create organization
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: adminSignupDto.organizationName,
        industry: adminSignupDto.industry,
        size: adminSignupDto.companySize,
        country: adminSignupDto.country,
        city: adminSignupDto.city,
      })
      .select()
      .single();

    if (orgError) {
      throw new BadRequestException('Failed to create organization');
    }

    // Create admin user
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        organization_id: organization.id,
        email: adminSignupDto.email,
        password_hash: passwordHash,
        first_name: adminSignupDto.firstName,
        last_name: adminSignupDto.lastName,
        phone: adminSignupDto.phone,
        role: UserRole.ADMIN,
        is_active: true,
      })
      .select()
      .single();

    if (userError) {
      // Rollback: delete organization
      await supabase.from('organizations').delete().eq('id', organization.id);
      throw new BadRequestException('Failed to create user');
    }

    // Generate JWT token
    const accessToken = this.generateToken(user);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        organizationId: user.organization_id,
      },
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const supabase = this.supabaseService.getAdminClient();

    // Find user by email
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', loginDto.email)
      .single();

    if (error || !user) {
      console.error(`❌ Login failed: User not found for email: ${loginDto.email}`, error);
      throw new UnauthorizedException('Invalid credentials');
    }

    console.log(`✓ User found: ${user.email}, active: ${user.is_active}`);

    // Check if user is active
    if (!user.is_active) {
      console.error(`❌ Login failed: Account suspended for ${loginDto.email}`);
      throw new UnauthorizedException('Account is suspended');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password_hash,
    );

    if (!isPasswordValid) {
      console.error(`❌ Login failed: Invalid password for ${loginDto.email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    console.log(`✓ Password verified for ${loginDto.email}`);

    // Update last login
    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    // Generate JWT token
    const accessToken = this.generateToken(user);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        organizationId: user.organization_id,
      },
    };
  }

  async acceptInvitation(
    acceptInvitationDto: AcceptInvitationDto,
  ): Promise<AuthResponseDto> {
    const supabase = this.supabaseService.getAdminClient();

    // Find invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('invitations')
      .select('*')
      .eq('token', acceptInvitationDto.token)
      .eq('status', 'pending')
      .single();

    if (inviteError || !invitation) {
      throw new NotFoundException('Invalid or expired invitation');
    }

    // Check if invitation has expired
    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from('invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);

      throw new BadRequestException('Invitation has expired');
    }

    // Check if email already registered
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', invitation.email)
      .single();

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(acceptInvitationDto.password, 10);

    // Create user
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        organization_id: invitation.organization_id,
        email: invitation.email,
        password_hash: passwordHash,
        first_name: acceptInvitationDto.firstName,
        last_name: acceptInvitationDto.lastName,
        phone: acceptInvitationDto.phone,
        role: invitation.role,
        is_active: true,
      })
      .select()
      .single();

    if (userError) {
      throw new BadRequestException('Failed to create user');
    }

    // Mark invitation as accepted
    await supabase
      .from('invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invitation.id);

    // Generate JWT token
    const accessToken = this.generateToken(user);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        organizationId: user.organization_id,
      },
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<void> {
    const supabase = this.supabaseService.getAdminClient();

    // Find user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', forgotPasswordDto.email)
      .single();

    if (!user) {
      // Don't reveal if email exists
      return;
    }

    // Generate reset token
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours

    // Save reset token
    await supabase.from('password_reset_tokens').insert({
      user_id: user.id,
      token,
      expires_at: expiresAt.toISOString(),
    });

    // TODO: Send password reset email
    console.log(`Password reset token for ${forgotPasswordDto.email}: ${token}`);
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<void> {
    const supabase = this.supabaseService.getAdminClient();

    // Find token
    const { data: resetToken, error } = await supabase
      .from('password_reset_tokens')
      .select('*')
      .eq('token', resetPasswordDto.token)
      .is('used_at', null)
      .single();

    if (error || !resetToken) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Check if token has expired
    if (new Date(resetToken.expires_at) < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(resetPasswordDto.newPassword, 10);

    // Update user password
    await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('id', resetToken.user_id);

    // Mark token as used
    await supabase
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', resetToken.id);
  }

  async validateUser(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (!user || !user.is_active) {
      throw new UnauthorizedException();
    }

    return user;
  }

  private generateToken(user: any): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organization_id,
    };

    return this.jwtService.sign(payload);
  }
}
