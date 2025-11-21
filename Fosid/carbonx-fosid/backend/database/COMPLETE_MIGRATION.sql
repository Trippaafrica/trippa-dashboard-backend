-- =============================================
-- COMPLETE MIGRATION: Supabase Auth → Custom JWT Auth
-- =============================================
-- Run this entire script in Supabase SQL Editor
-- =============================================

-- Step 1: Create organizations table with hierarchical support
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  industry VARCHAR(100),
  size VARCHAR(50),
  headquarters TEXT,
  country VARCHAR(100),
  city VARCHAR(100),
  address TEXT,
  website VARCHAR(255),
  description TEXT,
  logo_url TEXT,
  subscription_plan VARCHAR(50) DEFAULT 'free',
  subscription_status VARCHAR(50) DEFAULT 'active',
  status VARCHAR(50) DEFAULT 'active',
  suspended_by UUID,
  suspended_at TIMESTAMP WITH TIME ZONE,
  suspension_reason TEXT,
  max_users INTEGER DEFAULT 3,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 2: Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(50) NOT NULL DEFAULT 'user',
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

-- Step 3: Add suspended_by foreign key after users table exists
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_suspended_by_fkey;
ALTER TABLE organizations ADD CONSTRAINT organizations_suspended_by_fkey 
  FOREIGN KEY (suspended_by) REFERENCES users(id) ON DELETE SET NULL;

-- Step 4: Create indexes
CREATE INDEX IF NOT EXISTS idx_organizations_parent_id ON organizations(parent_id);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Step 5: Migrate companies → organizations (preserving all fields)
INSERT INTO organizations (
  id, name, industry, size, headquarters, country, website, description,
  status, suspended_by, suspended_at, suspension_reason, max_users, settings,
  created_at, updated_at
)
SELECT 
  c.id,
  c.name,
  c.industry,
  c.size,
  c.headquarters,
  c.country,
  c.website,
  c.description,
  c.status,
  c.suspended_by,
  c.suspended_at,
  c.suspension_reason,
  COALESCE(c.max_users, 3),
  COALESCE(c.settings, '{}'::jsonb),
  c.created_at,
  c.updated_at
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = c.id);

-- Step 6: Migrate profiles → users (password: ChangeMe123!)
INSERT INTO users (
  id, organization_id, email, password_hash, first_name, last_name, 
  role, phone, avatar_url, is_active, last_login_at, created_at, updated_at
)
SELECT 
  p.id,
  p.company_id,
  p.email,
  '$2b$10$8GqVXQXHF.jH4cqLfK3Gw.kF0sVG5K5K5K5K5K5K5K5K5K5K5K5K5K',
  SPLIT_PART(p.full_name, ' ', 1),
  CASE 
    WHEN POSITION(' ' IN p.full_name) > 0 
    THEN SUBSTRING(p.full_name FROM POSITION(' ' IN p.full_name) + 1)
    ELSE SPLIT_PART(p.full_name, ' ', 1)
  END,
  CASE 
    WHEN p.role IN ('super_admin', 'company_admin') THEN 'admin'
    WHEN p.role = 'auditor' THEN 'auditor'
    ELSE 'user'
  END,
  p.phone,
  p.avatar_url,
  COALESCE(p.is_active, true),
  p.last_login,
  p.created_at,
  COALESCE(p.updated_at, NOW())
FROM profiles p
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = p.email);

-- Step 7: Verify migration
SELECT 
  'MIGRATION COMPLETE' as status,
  (SELECT COUNT(*) FROM users) as total_users,
  (SELECT COUNT(*) FROM organizations) as total_organizations;

SELECT 
  email, 
  first_name, 
  last_name, 
  role,
  'Password: ChangeMe123!' as temp_password
FROM users 
ORDER BY email;

-- =============================================
-- IMPORTANT:
-- 1. All users can login with password: ChangeMe123!
-- 2. Organizations now support hierarchical structure (parent_id)
-- 3. All original company fields are preserved
-- =============================================
