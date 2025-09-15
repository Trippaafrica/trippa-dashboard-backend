import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class GlovoAddressService {
  private glovoBaseUrl = process.env.GLOVO_BASE_URL || 'https://stageapi.glovoapp.com';

  constructor(private httpService: HttpService) {}

  async createAddressBookEntry({
    address,
    phoneNumber,
    coordinates
  }: {
    address: string;
    phoneNumber: string;
    coordinates: { latitude: number; longitude: number };
  }): Promise<string> {
    const url = `${this.glovoBaseUrl}/v2/laas/addresses`;
    const body = {
      address,
      phoneNumber,
      coordinates
    };
    const headers = { 'Content-Type': 'application/json' };
    const resp = await firstValueFrom(this.httpService.post(url, body, { headers }));
    return resp.data.id;
  }

  async updateAddressBookEntry(
    addressBookId: string,
    params: {
      address: string;
      phoneNumber: string;
      coordinates: { latitude: number; longitude: number };
    }
  ): Promise<boolean> {
    const url = `${this.glovoBaseUrl}/v2/laas/addresses/${addressBookId}`;
    const body = {
      address: params.address,
      phoneNumber: params.phoneNumber,
      coordinates: params.coordinates
    };
    const headers = { 'Content-Type': 'application/json' };
    const resp = await firstValueFrom(this.httpService.put(url, body, { headers }));
    return resp.status === 200;
  }

  async deleteAddressBookEntry(addressBookId: string): Promise<boolean> {
    const url = `${this.glovoBaseUrl}/v2/laas/addresses/${addressBookId}`;
    const resp = await firstValueFrom(this.httpService.delete(url));
    return resp.status === 200 || resp.status === 204;
  }
}
