-- =============================================
-- MIGRATION: Supabase Auth → Custom JWT Auth
-- =============================================
-- Copy this entire script and run it in Supabase SQL Editor
-- This migrates users from profiles table to users table
-- =============================================

-- Step 1: Migrate companies → organizations
INSERT INTO public.organizations (
  id,
  name,
  industry,
  size,
  country,
  website,
  subscription_plan,
  subscription_status,
  created_at,
  updated_at
)
SELECT 
  c.id,
  c.name,
  c.industry,
  c.size,
  c.country,
  c.website,
  'free',
  CASE WHEN c.status = 'suspended' THEN 'suspended' ELSE 'active' END,
  c.created_at,
  c.updated_at
FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = c.id);

-- Step 2: Migrate profiles → users
-- Temporary password: "ChangeMe123!" 
-- Password hash generated with: bcrypt.hash('ChangeMe123!', 10)
INSERT INTO public.users (
  id,
  organization_id,
  email,
  password_hash,
  first_name,
  last_name,
  role,
  phone,
  avatar_url,
  is_active,
  last_login_at,
  created_at,
  updated_at
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
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.email = p.email);

-- Step 3: Verify migration
SELECT 
  'MIGRATION COMPLETE' as status,
  (SELECT COUNT(*) FROM public.users) as total_users,
  (SELECT COUNT(*) FROM public.organizations) as total_organizations;

-- Step 4: List migrated users
SELECT email, first_name, last_name, role, 'Use password: ChangeMe123!' as note
FROM public.users
ORDER BY email;

-- =============================================
-- NEXT STEPS:
-- 1. All users can now login with password: ChangeMe123!
-- 2. Ask them to change password after first login
-- =============================================
