// TypeScript type for a wallet entity
export type Wallet = {
  id: string;
  user_id: string; // Reference to supabase_user_id or business id
  balance: number; // Wallet balance in kobo (for Naira)
  created_at: string; // ISO string
  updated_at: string; // ISO string
};
