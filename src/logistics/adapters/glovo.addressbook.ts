import { Injectable } from '@nestjs/common';
import { GeocodeService } from '../../utils/geocode.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { createHash } from 'crypto';


@Injectable()
export class GlovoAddressBookService {
  private glovoBaseUrl = process.env.GLOVO_BASE_URL || 'https://stageapi.glovoapp.com';
  private static readonly DEFAULT_GLOVO_PHONE = '+2348130926960';

  constructor(
    private httpService: HttpService,
    private geocodeService: GeocodeService,
  ) {}

  /**
   * Upsert (create or update) a Glovo address book entry based on the presence of addressBookId.
   * Geocodes the address before sending to Glovo.
   * @param payload - The address payload (should contain address, addressDetails, phoneNumber)
   * @param addressBookId - The Glovo address book ID (null for create, string for update)
   * @returns The Glovo address book ID
   */
  async upsertAddressBookEntry(payload: any, addressBookId: string | null): Promise<string> {
    // Geocode the address
    const geocode = await this.geocodeService.getGeocodeData(payload.address);
    console.log('[GlovoAddressBookService] Geocoded data:', geocode);
    if (!geocode) {
      throw new Error('Failed to geocode address');
    }
    const glovoPayload = {
      ...payload,
      address: geocode.formattedAddress,
      coordinates: {
        latitude: geocode.coordinates[0],
        longitude: geocode.coordinates[1],
      },
    };
    console.log('[GlovoAddressBookService] Prepared Glovo payload:', glovoPayload);
    if (!addressBookId) {
      console.log('[GlovoAddressBookService] Calling CREATE address book endpoint...');
      return this.createAddressBookEntry(glovoPayload);
    } else {
      console.log('[GlovoAddressBookService] Calling UPDATE address book endpoint for ID:', addressBookId);
      return this.updateAddressBookEntry(addressBookId, glovoPayload);
    }
  }

  // Normalize and hash an address string to cache/reuse address book entries globally
  private hashAddress(address: string): string {
    const norm = (address || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return createHash('sha256').update(norm).digest('hex');
  }

  // Global get-or-create that uses a Supabase-backed cache table `glovo_address_book_map`
  // Always uses DEFAULT_GLOVO_PHONE for address book creation
  async getOrCreateGlobalAddressBookId(rawAddress: string): Promise<string> {
    const geocode = await this.geocodeService.getGeocodeData(rawAddress);
    if (!geocode) throw new Error('Failed to geocode address');
    const formattedAddress = geocode.formattedAddress;
    const coordinates = { latitude: geocode.coordinates[0], longitude: geocode.coordinates[1] };
    const addressHash = this.hashAddress(formattedAddress);

    const { supabase } = await import('../../auth/supabase.client');
    const { data: existing } = await supabase
      .from('glovo_address_book_map')
      .select('glovo_address_book_id')
      .eq('address_hash', addressHash)
      .maybeSingle();
    if (existing?.glovo_address_book_id) {
      return existing.glovo_address_book_id as string;
    }

    const payload = {
      address: formattedAddress,
      addressDetails: '',
      phoneNumber: GlovoAddressBookService.DEFAULT_GLOVO_PHONE,
      coordinates,
    };
    let id: string | null = null;
    try {
      id = await this.createAddressBookEntry(payload);
    } catch (e: any) {
      const status = e?.response?.status || e?.status;
      if (status === 409) {
        console.warn('[GlovoAddressBookService] Glovo create returned 409 (exists in another account). Returning null to allow fallback.');
        return null as any; // caller should handle null by skipping Glovo
      }
      throw e;
    }

    const { error: cacheUpsertError } = await supabase
      .from('glovo_address_book_map')
      .upsert(
        {
          address_hash: addressHash,
          formatted_address: formattedAddress,
          phone_number: GlovoAddressBookService.DEFAULT_GLOVO_PHONE,
          glovo_address_book_id: id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'address_hash' }
      );
    if (cacheUpsertError) {
      console.warn('[GlovoAddressBookService] Cache upsert failed for addressHash', addressHash, cacheUpsertError);
    }
    return id;
  }

  // Lookup only: try to resolve a cached glovo_address_book_id for a given raw address
  // Does NOT call Glovo APIs or create anything. Returns null if not found.
  async lookupAddressBookIdByAddress(rawAddress: string): Promise<string | null> {
    const geocode = await this.geocodeService.getGeocodeData(rawAddress);
    if (!geocode) return null;
    const formattedAddress = geocode.formattedAddress;
    const addressHash = this.hashAddress(formattedAddress);
    const { supabase } = await import('../../auth/supabase.client');
    const { data: existing } = await supabase
      .from('glovo_address_book_map')
      .select('glovo_address_book_id')
      .eq('address_hash', addressHash)
      .maybeSingle();
    return existing?.glovo_address_book_id || null;
  }

  /**
   * Get formatted address and coordinates without creating Glovo address book entry
   * Useful for validation and caching checks
   */
  async getFormattedAddressInfo(rawAddress: string): Promise<{
    formattedAddress: string;
    coordinates: { latitude: number; longitude: number };
    addressHash: string;
  } | null> {
    const geocode = await this.geocodeService.getGeocodeData(rawAddress);
    if (!geocode) return null;
    return {
      formattedAddress: geocode.formattedAddress,
      coordinates: { latitude: geocode.coordinates[0], longitude: geocode.coordinates[1] },
      addressHash: this.hashAddress(geocode.formattedAddress),
    };
  }

  /**
   * Check if an address exists in the cache without geocoding (for quick lookups)
   * Returns the Glovo address book ID if found, null otherwise
   */
  async quickLookupByHash(addressHash: string): Promise<string | null> {
    const { supabase } = await import('../../auth/supabase.client');
    const { data: existing } = await supabase
      .from('glovo_address_book_map')
      .select('glovo_address_book_id')
      .eq('address_hash', addressHash)
      .maybeSingle();
    return existing?.glovo_address_book_id || null;
  }

  async getToken(): Promise<string> {
    // You may want to share this logic with GlovoAdapter
    const url = `${this.glovoBaseUrl}/oauth/token`;
    const body = {
      grantType: 'client_credentials',
      clientId: Number(process.env.GLOVO_CLIENT_ID),
      clientSecret: process.env.GLOVO_CLIENT_SECRET,
    };
    const resp = await firstValueFrom(this.httpService.post(url, body));
    return resp.data?.accessToken;
  }

  async createAddressBookEntry(payload: any): Promise<string> {
    const token = await this.getToken();
    const url = `${this.glovoBaseUrl}/v2/laas/addresses`;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    console.log('[GlovoAddressBookService] Sending POST to Glovo:', url, payload);
    
    try {
      const resp = await firstValueFrom(this.httpService.post(url, payload, { headers }));
      console.log('[GlovoAddressBookService] Glovo create response:', resp.data);
      return resp.data.id;
    } catch (error: any) {
      const status = error?.response?.status;
      const errorData = error?.response?.data;
      
      // Handle 409 Conflict - Address already exists
      if (status === 409) {
        console.log('[GlovoAddressBookService] Address already exists in Glovo (409), attempting lookup...');
        // The address exists but might be in another account's address book
        // Try to extract ID from error response if available
        if (errorData?.id) {
          return errorData.id;
        }
        throw new Error('GLOVO_ADDRESS_EXISTS_DIFFERENT_ACCOUNT');
      }
      
      console.error('[GlovoAddressBookService] Glovo create failed:', { status, errorData });
      throw error;
    }
  }

  async updateAddressBookEntry(addressBookId: string, payload: any): Promise<string> {
    const token = await this.getToken();
    const url = `${this.glovoBaseUrl}/v2/laas/addresses/${addressBookId}`;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    console.log('[GlovoAddressBookService] Sending PUT to Glovo:', url, payload);
    
    try {
      const resp = await firstValueFrom(this.httpService.put(url, payload, { headers }));
      console.log('[GlovoAddressBookService] Glovo update response:', resp.data);
      return resp.data.id;
    } catch (error: any) {
      console.error('[GlovoAddressBookService] Glovo update failed:', error?.response?.data);
      throw error;
    }
  }

  /**
   * Get statistics about the global address book cache
   * Useful for monitoring and optimization
   */
  async getCacheStatistics(): Promise<{
    totalAddresses: number;
    uniqueHashes: number;
    recentAdditions: number;
  }> {
    const { supabase } = await import('../../auth/supabase.client');
    
    // Total addresses in cache
    const { count: totalCount } = await supabase
      .from('glovo_address_book_map')
      .select('*', { count: 'exact', head: true });
    
    // Recent additions (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from('glovo_address_book_map')
      .select('*', { count: 'exact', head: true })
      .gte('updated_at', oneDayAgo);
    
    return {
      totalAddresses: totalCount || 0,
      uniqueHashes: totalCount || 0, // Same as total since hash is unique
      recentAdditions: recentCount || 0,
    };
  }

  /**
   * Clean up orphaned or old address book entries from cache
   * Can be called periodically to maintain cache health
   */
  async cleanupOldEntries(daysOld: number = 90): Promise<number> {
    const { supabase } = await import('../../auth/supabase.client');
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: oldEntries } = await supabase
      .from('glovo_address_book_map')
      .select('address_hash')
      .lt('updated_at', cutoffDate);
    
    if (!oldEntries || oldEntries.length === 0) return 0;
    
    const { error } = await supabase
      .from('glovo_address_book_map')
      .delete()
      .lt('updated_at', cutoffDate);
    
    if (error) {
      console.error('[GlovoAddressBookService] Cleanup failed:', error);
      return 0;
    }
    
    console.log(`[GlovoAddressBookService] Cleaned up ${oldEntries.length} old address book entries`);
    return oldEntries.length;
  }
}
