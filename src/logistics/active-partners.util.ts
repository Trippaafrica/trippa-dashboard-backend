import { supabase } from '../auth/supabase.client';

/**
 * Fetches all active logistics partners from the DB.
 * Returns an array of partner names (e.g. ['glovo', 'faramove'])
 */
export async function getActiveLogisticsPartners(): Promise<string[]> {
  const { data, error } = await supabase
    .from('logistics_partner')
    .select('name, isActive');
  if (error) throw error;
  return (data || [])
    .filter((p: any) => p.isActive)
    .map((p: any) => p.name.toLowerCase());
}
