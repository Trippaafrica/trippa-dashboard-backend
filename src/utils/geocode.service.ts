
import { Injectable } from '@nestjs/common';
import { getCoordinatesFromAddress, getGeocodeData as utilGetGeocodeData } from '../utils/geocode.util';
import { UnifiedQuoteRequest } from '../logistics/types';

// Only keep one GeocodeService class and update all references to utilGetGeocodeData
@Injectable()
export class GeocodeService {
  async addCoordinatesToRequest(request: UnifiedQuoteRequest): Promise<UnifiedQuoteRequest> {
    // console.log('GeocodeService.addCoordinatesToRequest - pickup address:', request?.pickup?.address);
    // console.log('GeocodeService.addCoordinatesToRequest - delivery address:', request?.delivery?.address);
    if (!request?.pickup?.address || !request?.delivery?.address) {
      console.error('GeocodeService.addCoordinatesToRequest - ERROR: pickup or delivery address is missing!', {
        pickup: request?.pickup,
        delivery: request?.delivery,
      });
      throw new Error('Pickup or delivery address is missing in UnifiedQuoteRequest');
    }
    const pickupCoords = await getCoordinatesFromAddress(request.pickup.address);
    const deliveryCoords = await getCoordinatesFromAddress(request.delivery.address);
    return {
      ...request,
      pickup: {
        ...request.pickup,
        coordinates: pickupCoords || undefined,
      },
      delivery: {
        ...request.delivery,
        coordinates: deliveryCoords || undefined,
      },
    };
  }

  async addGeocodeDataToRequest(request: UnifiedQuoteRequest): Promise<any> {
    const pickupData = await utilGetGeocodeData(request.pickup.address);
    const deliveryData = await utilGetGeocodeData(request.delivery.address);
    return {
      ...request,
      pickup: {
        ...request.pickup,
        coordinates: pickupData?.coordinates || undefined,
        formattedAddress: pickupData?.formattedAddress || undefined,
      },
      delivery: {
        ...request.delivery,
        coordinates: deliveryData?.coordinates || undefined,
        formattedAddress: deliveryData?.formattedAddress || undefined,
      },
    };
  }

  /**
   * Geocode a single address and return coordinates, formatted address, and postal code
   */
  async getGeocodeData(address: string): Promise<{ 
    coordinates: [number, number], 
    formattedAddress: string,
    postalCode?: string,
    addressComponents?: any[]
  } | null> {
    return utilGetGeocodeData(address);
  }
}

// Removed duplicate GeocodeService class and updated references to utilGetGeocodeData above
