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
    const id = await this.createAddressBookEntry(payload);

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
    const headers = { Authorization: `Bearer ${token}` };
    console.log('[GlovoAddressBookService] Sending POST to Glovo:', url, payload);
    const resp = await firstValueFrom(this.httpService.post(url, payload, { headers }));
    console.log('[GlovoAddressBookService] Glovo create response:', resp.data);
    return resp.data.id;
  }

  async updateAddressBookEntry(addressBookId: string, payload: any): Promise<string> {
    const token = await this.getToken();
    const url = `${this.glovoBaseUrl}/v2/laas/addresses/${addressBookId}`;
    const headers = { Authorization: `Bearer ${token}` };
    console.log('[GlovoAddressBookService] Sending PUT to Glovo:', url, payload);
    const resp = await firstValueFrom(this.httpService.put(url, payload, { headers }));
    console.log('[GlovoAddressBookService] Glovo update response:', resp.data);
    return resp.data.id;
  }
}
