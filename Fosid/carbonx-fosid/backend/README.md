# CarbonX Backend API

NestJS backend for CarbonX - Carbon footprint tracking and management platform.

## Architecture Overview

This is a **multi-tenant SaaS application** with the following user flow:

1. **Admin Registration** → Admin signs up and creates organization
2. **Admin Setup** → Admin sets up organization profile
3. **User Invitations** → Admin invites users to join organization
4. **User Onboarding** → Invited users accept invitation and create account

## Features

### Authentication & Authorization
- ✅ JWT-based authentication
- ✅ Role-based access control (Admin, Auditor, User)
- ✅ Password hashing with bcrypt
- ✅ Forgot password / Reset password flow
- ✅ Email verification system

### User Management
- ✅ Multi-tenant organization structure
- ✅ User invitation system
- ✅ Role management (Admin only)
- ✅ User status management (Active/Suspended)
- ✅ Profile management

### Organization Management
- ✅ Organization creation during signup
- ✅ Organization profile updates
- ✅ Organization statistics dashboard
- ✅ Subscription management

### API Documentation
- ✅ Swagger/OpenAPI documentation at `/api/docs`

## Tech Stack

- **Framework**: NestJS 11
- **Database**: Supabase (PostgreSQL)
- **Authentication**: JWT with Passport
- **Validation**: class-validator
- **Documentation**: Swagger/OpenAPI
- **Language**: TypeScript

## Project Structure

```
backend/
├── src/
│   ├── auth/                 # Authentication module
│   │   ├── dto/             # Data transfer objects
│   │   ├── guards/          # JWT auth guard
│   │   ├── strategies/      # Passport JWT strategy
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── auth.module.ts
│   ├── users/               # User management module
│   │   ├── dto/
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── users.module.ts
│   ├── organizations/       # Organization management module
│   │   ├── dto/
│   │   ├── organizations.controller.ts
│   │   ├── organizations.service.ts
│   │   └── organizations.module.ts
│   ├── invitations/         # Invitation system module
│   │   ├── dto/
│   │   ├── invitations.controller.ts
│   │   ├── invitations.service.ts
│   │   └── invitations.module.ts
│   ├── supabase/            # Supabase client module
│   │   ├── supabase.service.ts
│   │   └── supabase.module.ts
│   ├── common/              # Shared utilities
│   │   ├── decorators/      # Custom decorators
│   │   ├── guards/          # Custom guards
│   │   └── types/           # Type definitions
│   ├── app.module.ts
│   └── main.ts
├── database/
│   └── schema.sql           # Database schema
├── .env                     # Environment variables
└── package.json
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and update the values:

```bash
cp .env.example .env
```

Update the following variables:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
- `JWT_SECRET` - A strong secret key for JWT
- `FRONTEND_URL` - Your frontend URL (default: http://localhost:3000)

### 3. Set Up Database

Run the SQL schema in your Supabase SQL Editor:

```bash
# Copy the contents of database/schema.sql
# Paste and run in Supabase SQL Editor
```

This will create:
- Organizations table
- Users table
- Invitations table
- Password reset tokens table
- Indexes and triggers
- Row Level Security policies

### 4. Run the Application

**Development mode:**
```bash
npm run start:dev
```

**Production mode:**
```bash
npm run build
npm run start:prod
```

The API will be available at: `http://localhost:3001`

### 5. Access API Documentation

Navigate to: `http://localhost:3001/api/docs`

## API Endpoints

### Authentication

| Method | Endpoint | Description | Public |
|--------|----------|-------------|--------|
| POST | `/auth/signup` | Register admin & create organization | ✅ |
| POST | `/auth/login` | Login with email/password | ✅ |
| POST | `/auth/accept-invitation` | Accept invitation & create account | ✅ |
| POST | `/auth/forgot-password` | Request password reset | ✅ |
| POST | `/auth/reset-password` | Reset password with token | ✅ |

### Users

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/users/me` | Get my profile | All |
| PUT | `/users/me` | Update my profile | All |
| GET | `/users/organization/:id` | Get organization users | All |
| GET | `/users/:id` | Get user by ID | All |
| PUT | `/users/:id/role` | Update user role | Admin |
| PUT | `/users/:id/status` | Update user status | Admin |
| DELETE | `/users/:id` | Delete user | Admin |

### Organizations

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/organizations/me` | Get my organization | All |
| GET | `/organizations/:id` | Get organization by ID | All |
| PUT | `/organizations/:id` | Update organization | Admin |
| GET | `/organizations/:id/stats` | Get organization stats | Admin |

### Invitations

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/invitations` | Create invitation | Admin |
| GET | `/invitations` | Get all invitations | Admin |
| GET | `/invitations/pending` | Get pending invitations | Admin |
| GET | `/invitations/verify?token=xxx` | Verify invitation token | Public |
| POST | `/invitations/:id/resend` | Resend invitation | Admin |
| POST | `/invitations/:id/revoke` | Revoke invitation | Admin |
| DELETE | `/invitations/:id` | Delete invitation | Admin |

## User Roles

### Admin
- Full access to organization
- Can invite users
- Can manage users (change roles, suspend, delete)
- Can update organization settings
- Cannot delete themselves
- Cannot remove last admin

### Auditor
- Read access to emissions data
- Can generate reports
- Cannot modify user settings
- Cannot invite users

### User
- Basic access to features
- Can manage their own profile
- Can view organization data
- Cannot manage other users

## Authentication Flow

### 1. Admin Signup Flow

```
1. Admin fills signup form (email, password, name, org details)
2. Backend creates organization
3. Backend creates admin user
4. Backend returns JWT token
5. Admin is logged in
```

### 2. User Invitation Flow

```
1. Admin sends invitation (email + role)
2. Backend creates invitation with unique token
3. Invitation email sent to user (with link)
4. User clicks link and fills signup form
5. Backend verifies token and creates user
6. Backend returns JWT token
7. User is logged in
```

### 3. Login Flow

```
1. User submits email + password
2. Backend verifies credentials
3. Backend checks if user is active
4. Backend returns JWT token
5. User is logged in
```

## Security Features

- ✅ Password hashing with bcrypt (10 rounds)
- ✅ JWT token expiration (7 days default)
- ✅ Row Level Security (RLS) in Supabase
- ✅ CORS protection
- ✅ Input validation with class-validator
- ✅ Role-based access control
- ✅ Protected routes with JWT guard
- ✅ Email verification system
- ✅ Password reset with expiring tokens

## Database Schema

### Organizations Table
- `id` - UUID primary key
- `name` - Organization name
- `industry`, `size`, `country`, `city` - Organization details
- `subscription_plan`, `subscription_status` - Subscription info
- Timestamps

### Users Table
- `id` - UUID primary key
- `organization_id` - Foreign key to organizations
- `email` - Unique email address
- `password_hash` - Bcrypt hashed password
- `first_name`, `last_name`, `phone` - User details
- `role` - User role (admin, auditor, user)
- `is_active`, `is_email_verified` - Status flags
- Timestamps

### Invitations Table
- `id` - UUID primary key
- `organization_id` - Foreign key to organizations
- `email` - Invitation email
- `role` - Assigned role
- `token` - Unique invitation token
- `status` - pending, accepted, expired, revoked
- `expires_at` - Expiration timestamp
- Timestamps

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anon key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service key | Yes |
| `JWT_SECRET` | JWT secret key | Yes |
| `JWT_EXPIRATION` | JWT expiration time | No (default: 7d) |
| `PORT` | Server port | No (default: 3001) |
| `NODE_ENV` | Environment | No (default: development) |
| `FRONTEND_URL` | Frontend URL for CORS | Yes |

## Development

### Running Tests
```bash
npm run test
```

### Linting
```bash
npm run lint
```

### Format Code
```bash
npm run format
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Use strong `JWT_SECRET`
3. Enable HTTPS
4. Configure proper CORS settings
5. Set up email service (SMTP)
6. Enable rate limiting
7. Set up monitoring and logging

## Next Steps

- [ ] Implement email service (NodeMailer/SendGrid)
- [ ] Add rate limiting for auth endpoints
- [ ] Add refresh token mechanism
- [ ] Implement audit logs
- [ ] Add file upload for avatars/logos
- [ ] Implement 2FA (Two-Factor Authentication)
- [ ] Add API versioning
- [ ] Implement caching (Redis)
- [ ] Add comprehensive error logging
- [ ] Set up CI/CD pipeline

## Support

For issues or questions, please contact the development team.

## License

Proprietary - All rights reserved
