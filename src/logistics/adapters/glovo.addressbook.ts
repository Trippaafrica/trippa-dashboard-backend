import { Injectable } from '@nestjs/common';
import { GeocodeService } from '../../utils/geocode.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';


@Injectable()
export class GlovoAddressBookService {
  private glovoBaseUrl = process.env.GLOVO_BASE_URL || 'https://stageapi.glovoapp.com';

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
