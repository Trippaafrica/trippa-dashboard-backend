import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  SignupDto,
  AdminSignupDto,
  LoginDto,
  AcceptInvitationDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  AuthResponseDto,
} from './dto/auth.dto';
import { Public } from '../common/decorators/roles.decorator';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('signup')
  @ApiOperation({ summary: 'Register a new user (simple signup without organization)' })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  async signup(@Body() signupDto: SignupDto): Promise<AuthResponseDto> {
    return this.authService.signup(signupDto);
  }

  @Public()
  @Post('signup/admin')
  @ApiOperation({ summary: 'Register a new admin and create organization (alternative flow)' })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  async adminSignup(@Body() adminSignupDto: AdminSignupDto): Promise<AuthResponseDto> {
    return this.authService.adminSignup(adminSignupDto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('accept-invitation')
  @ApiOperation({ summary: 'Accept invitation and create account' })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  async acceptInvitation(
    @Body() acceptInvitationDto: AcceptInvitationDto,
  ): Promise<AuthResponseDto> {
    return this.authService.acceptInvitation(acceptInvitationDto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset' })
  @ApiResponse({ status: 200 })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto): Promise<void> {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 200 })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto): Promise<void> {
    return this.authService.resetPassword(resetPasswordDto);
  }
}
