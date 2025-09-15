import { UploadProfileImageDto } from './upload-profile-image.dto';
import { Express } from 'express';
import { Request } from 'express';
import { Controller, Post, Body, Get, Patch, Req, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService } from './auth.service';
import { AdminService } from './admin.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly adminService: AdminService,
  ) {}

  @Post('upload-profile-image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadProfileImage(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    // Expect Bearer token in Authorization header
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return { error: 'Missing or invalid Authorization header' };
    }
    const token = authHeader.replace('Bearer ', '');
    if (!file) {
      return { error: 'No file uploaded' };
    }
    return this.authService.uploadProfileImage(token, file);
  }

  @Post('signup')
  async signup(@Body() body: any) {
    return this.authService.signup(body);
  }

  @Post('login')
  async login(@Body() body: any) {
    return this.authService.login(body);
  }

  @Post('verify-otp')
  async verifyOtp(@Body() body: any) {
    return this.authService.verifyOtp(body);
  }

  @Get('business')
  async getBusiness(@Req() req: any) {
    return this.authService.getBusiness(req);
  }

  @Patch('business')
  async updateBusiness(@Req() req: any, @Body() body: any) {
    return this.authService.updateBusiness(req, body);
  }

  @Post('request-password-reset')
  async requestPasswordReset(@Body() body: any) {
    return this.authService.requestPasswordReset(body);
  }

  @Post('admin-signup')
  async adminSignup(@Body() body: any) {
    return this.adminService.createAdminUser(body);
  }

  @Post('admin-login')
  async adminLogin(@Body() body: any) {
    return this.adminService.loginAdmin(body);
  }

  // Get current admin profile
  @Get('admin')
  async getAdmin(@Req() req: Request) {
    // Expect Bearer token in Authorization header
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return { error: 'Missing or invalid Authorization header' };
    }
    const token = authHeader.replace('Bearer ', '');
    return this.adminService.getAdminProfileByToken(token);
  }
}
