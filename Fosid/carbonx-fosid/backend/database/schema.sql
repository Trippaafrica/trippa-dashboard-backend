-- CarbonX Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- ORGANIZATIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID REFERENCES organizations(id) ON DELETE CASCADE, -- For hierarchical structure (branches/sub-locations)
  name VARCHAR(255) NOT NULL,
  industry VARCHAR(100),
  size VARCHAR(50), -- 'small', 'medium', 'large', 'enterprise'
  headquarters TEXT, -- Main office location description
  country VARCHAR(100),
  city VARCHAR(100),
  address TEXT,
  website VARCHAR(255),
  description TEXT, -- Company description
  logo_url TEXT,
  
  -- Subscription & Status
  subscription_plan VARCHAR(50) DEFAULT 'free', -- 'free', 'basic', 'premium', 'enterprise'
  subscription_status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive', 'suspended'
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'suspended', 'pending'
  
  -- Suspension tracking
  suspended_by UUID REFERENCES users(id) ON DELETE SET NULL, -- Admin who suspended
  suspended_at TIMESTAMP WITH TIME ZONE,
  suspension_reason TEXT,
  
  -- User limits & settings
  max_users INTEGER DEFAULT 3, -- Maximum users per organization
  settings JSONB DEFAULT '{}'::jsonb, -- Flexible settings storage
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- USERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(50) NOT NULL DEFAULT 'user', -- 'admin', 'auditor', 'user'
  phone VARCHAR(50),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  is_email_verified BOOLEAN DEFAULT false,
  email_verified_at TIMESTAMP WITH TIME ZONE,
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- =============================================
-- INVITATIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'accepted', 'expired', 'revoked'
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(organization_id, email)
);

-- =============================================
-- PASSWORD RESET TOKENS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_organizations_parent_id ON organizations(parent_id);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_invitations_organization_id ON invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);

-- =============================================
-- UPDATE TIMESTAMP TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invitations_updated_at
  BEFORE UPDATE ON invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Organizations: Users can only see their own organization
CREATE POLICY "Users can view their own organization"
  ON organizations FOR SELECT
  USING (id IN (SELECT organization_id FROM users WHERE users.id = auth.uid()));

CREATE POLICY "Admins can update their organization"
  ON organizations FOR UPDATE
  USING (id IN (
    SELECT organization_id FROM users 
    WHERE users.id = auth.uid() AND users.role = 'admin'
  ));

-- Users: Can view users in their organization
CREATE POLICY "Users can view users in their organization"
  ON users FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM users WHERE users.id = auth.uid()
  ));

CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Admins can update users in their organization"
  ON users FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM users 
    WHERE users.id = auth.uid() AND users.role = 'admin'
  ));

-- Invitations: Admins can manage invitations
CREATE POLICY "Admins can view invitations in their organization"
  ON invitations FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM users 
    WHERE users.id = auth.uid() AND users.role = 'admin'
  ));

CREATE POLICY "Admins can create invitations"
  ON invitations FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM users 
    WHERE users.id = auth.uid() AND users.role = 'admin'
  ));

CREATE POLICY "Admins can update invitations"
  ON invitations FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM users 
    WHERE users.id = auth.uid() AND users.role = 'admin'
  ));

-- Password reset tokens: Users can only see their own tokens
CREATE POLICY "Users can view their own password reset tokens"
  ON password_reset_tokens FOR SELECT
  USING (user_id = auth.uid());

-- =============================================
-- FUNCTIONS
-- =============================================

-- Function to check if email exists
CREATE OR REPLACE FUNCTION check_email_exists(email_to_check VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(SELECT 1 FROM users WHERE email = email_to_check);
END;
$$ LANGUAGE plpgsql;

-- Function to get organization admin count
CREATE OR REPLACE FUNCTION get_org_admin_count(org_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (SELECT COUNT(*) FROM users WHERE organization_id = org_id AND role = 'admin');
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- SAMPLE DATA (Optional - for testing)
-- =============================================
-- Uncomment to add sample data

-- INSERT INTO organizations (name, industry, size, country, city)
-- VALUES ('Acme Corporation', 'Technology', 'medium', 'United States', 'San Francisco');
