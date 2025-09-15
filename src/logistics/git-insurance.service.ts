import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class GitInsuranceService {
  constructor(private readonly httpService: HttpService) {}

  async buyGitOnDemandInsurance(payload: any): Promise<any> {
    // Replace with your actual API key or authentication method
    const apiKey = process.env.MYCOVER_API_KEY;
    const url = 'https://api.mycover.ai/v1/products/sti/buy-git-ondemand';
    try {
      const response = await this.httpService.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
      }).toPromise();
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.responseText || 'Failed to buy GIT insurance');
    }
  }
}
