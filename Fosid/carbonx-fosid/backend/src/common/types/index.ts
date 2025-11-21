export enum UserRole {
  ADMIN = 'admin',
  AUDITOR = 'auditor',
  USER = 'user',
}

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

export enum SubscriptionPlan {
  FREE = 'free',
  BASIC = 'basic',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
  organizationId: string;
}
