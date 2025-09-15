// Plain TypeScript type for a business entity, suitable for Supabase
export type Business = {
  id: string;
  email: string;
  phone: string;
  businessName: string;
  api_key?: string;
  pickup_address?: string;
  city?: string;
  state?: string;
  supabase_user_id?: string;
  glovoAddressBookId?: string; // Glovo addressBookId for pickup address
  created_at: string; // ISO string, as returned by Supabase
  updated_at: string; // ISO string, as returned by Supabase
  status: 'active' | 'inactive'; // Business status
  notifications_enabled?: boolean; // Notification preference
  hide_wallet_balance?: boolean; // Hide wallet balance preference
  dark_mode?: boolean; // Dark mode preference
};
