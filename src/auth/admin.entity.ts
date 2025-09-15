// TypeScript type for an admin user entity
export type AdminUser = {
  id: string;
  email: string;
  supabase_user_id: string;
  role: 'admin' | 'superadmin';
  created_at: string; // ISO string
};
