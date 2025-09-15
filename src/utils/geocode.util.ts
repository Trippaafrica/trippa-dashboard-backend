import axios from 'axios';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;


export async function getCoordinatesFromAddress(address: string): Promise<[number, number] | null> {
  const result = await getGeocodeData(address);
  return result ? result.coordinates : null;
}

export async function getGeocodeData(address: string): Promise<{ 
  coordinates: [number, number], 
  formattedAddress: string,
  postalCode?: string,
  addressComponents?: any[]
} | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('Google Maps API key is not set in environment variables.');
  }
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
  try {
    const response = await axios.get(url);
    const results = response.data.results;
    if (results && results.length > 0) {
      const result = results[0];
      const location = result.geometry.location;
      const formattedAddress = result.formatted_address;
      
      // Extract postal code from address components
      let postalCode = '';
      if (result.address_components) {
        const postalComponent = result.address_components.find((component: any) => 
          component.types.includes('postal_code')
        );
        if (postalComponent) {
          postalCode = postalComponent.long_name;
        }
      }
      
      return {
        coordinates: [location.lat, location.lng],
        formattedAddress,
        postalCode: postalCode || undefined,
        addressComponents: result.address_components,
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching geocode data:', error);
    return null;
  }
}
