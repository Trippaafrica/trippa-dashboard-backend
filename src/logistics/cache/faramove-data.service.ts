import { Injectable, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AppLogger } from '../../utils/logger.service';

@Injectable()
export class FaramoveDataService implements OnModuleInit {
  private readonly logger = new AppLogger(FaramoveDataService.name);
  private cache = new Map<string, any>();
  private apiKey = process.env.FARAMOVE_API_KEY;
  private baseUrl = process.env.FARAMOVE_BASE_URL || 'https://api.faramove.com';
  lastUpdated: Date;

  constructor(private httpService: HttpService) {}

  async onModuleInit() {
    await this.initialize();
  }

  async initialize() {
    // For production, fetch and cache from Faramove API
    if (process.env.NODE_ENV === 'production') {
      await this.refreshAllData();
      setInterval(() => this.refreshAllData(), 24 * 60 * 60 * 1000);
    } else {
      // For dev/test, hardcode test IDs
      // Lagos state: 632e1a67a44f438de79a7394
      // Oyo state:   632e1a67a44f438de79a739a
      // Ikeja city: 63bc2a4e18811d09f9a4193a
      // Weight range: 6646005a41bceaaef1f57c84
      const states = new Map();
      states.set('lagos', '632e1a67a44f438de79a7394');
      states.set('oyo', '632e1a67a44f438de79a739a');
      this.cache.set('states', states);
      this.cache.set('weightRanges', [
        { id: '6646005a41bceaaef1f57c84', minWeight: 0, maxWeight: 50 }
      ]);
      this.cache.set('cities', {
        '632e1a67a44f438de79a7394': [
          { id: '63bc2a4e18811d09f9a4193a', name: 'ikeja' },
          { id: 'other', name: 'other' }
        ],
        '632e1a67a44f438de79a739a': [
          { id: 'other', name: 'other' }
        ]
      });
      this.lastUpdated = new Date();
    }
  }

  async refreshAllData() {
    try {
      this.logger.logDataService('Starting data refresh from API...');
      
      // Fetch states from Faramove API
      const states = await this.fetchStatesFromFaramove();
      this.logger.logDataService(`Fetched ${states.size} states`);
      
      // Fetch weight ranges from Faramove API
      const weightRanges = await this.fetchWeightRangesFromFaramove();
      this.logger.logDataService(`Fetched ${weightRanges.length} weight ranges`);
      
      // Fetch cities for all states
      const cities = await this.fetchCitiesFromFaramove(Array.from(states.values()));
      this.logger.logDataService(`Fetched cities for ${Object.keys(cities).length} states`);
      
      // Update cache
      this.cache.set('states', states);
      this.cache.set('weightRanges', weightRanges);
      this.cache.set('cities', cities);
      this.lastUpdated = new Date();
      
      this.logger.logDataService('Data refresh completed successfully');
    } catch (error) {
      this.logger.error('Error refreshing data', error);
      throw error;
    }
  }

  private async fetchStatesFromFaramove(): Promise<Map<string, string>> {
    const url = `${this.baseUrl}/api/v2/states`;
    const headers = { 'api-key': this.apiKey };
    
    const response = await firstValueFrom(
      this.httpService.get(url, { headers })
    );
    
    const states = new Map<string, string>();
    
    if (response.data?.success && response.data?.data) {
      response.data.data.forEach((state: any) => {
        // Map state name to state ID
        states.set(state.name.toLowerCase().trim(), state._id);
      });
    }
    
    return states;
  }

  private async fetchWeightRangesFromFaramove(): Promise<any[]> {
    const url = `${this.baseUrl}/api/v2/weight-range`;
    const headers = { 'api-key': this.apiKey };
    
    const response = await firstValueFrom(
      this.httpService.get(url, { headers })
    );
    
    const weightRanges: any[] = [];
    
    if (response.data?.success && response.data?.data) {
      response.data.data.forEach((range: any) => {
        weightRanges.push({
          id: range._id,
          minWeight: range.minimum_range,
          maxWeight: range.maximum_range,
          vehicleType: range.vehicle_type?.[0]?.name || 'Unknown'
        });
      });
    }
    
    return weightRanges;
  }

  private async fetchCitiesFromFaramove(stateIds: string[]): Promise<Record<string, any[]>> {
    const cities: Record<string, any[]> = {};
    
    // Fetch cities for each state
    for (const stateId of stateIds) {
      try {
        const url = `${this.baseUrl}/api/v2/states/get-cities-per-state/${stateId}`;
        const headers = { 'api-key': this.apiKey };
        
        const response = await firstValueFrom(
          this.httpService.get(url, { headers })
        );
        
        if (response.data?.success && response.data?.data) {
          cities[stateId] = response.data.data.map((city: any) => ({
            id: city._id,
            name: city.name.toLowerCase().trim()
          }));
        } else {
          // Fallback to empty array if no cities found
          cities[stateId] = [];
        }
        
        // Add a small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.warn(`[FaramoveDataService] Could not fetch cities for state ${stateId}:`, error.message);
        // Add fallback cities for states that fail
        cities[stateId] = [{ id: 'other', name: 'other' }];
      }
    }
    
    return cities;
  }

  getCache(key: string) {
    return this.cache.get(key);
  }

  async getStateId(stateName: string): Promise<string> {
    const states = this.getCache('states');
    if (!states) throw new Error('States cache not loaded');
    const normalizedInput = stateName.trim().toLowerCase();
    let id = states.get(normalizedInput);
    if (!id) {
      // Try to match by first three letters
      for (const [name, stateId] of states.entries()) {
        if (name.slice(0, 3) === normalizedInput.slice(0, 3)) {
          id = stateId;
          break;
        }
      }
    }
    if (!id) throw new Error(`State not found: ${stateName}`);
    return id;
  }

  async getWeightRangeId(weightKg: number): Promise<string> {
    const ranges = this.getCache('weightRanges');
    if (!ranges) throw new Error('Weight ranges cache not loaded');
    const range = ranges.find((r: any) => weightKg >= r.minWeight && weightKg <= r.maxWeight);
    if (!range) throw new Error(`No weight range for ${weightKg}kg`);
    return range.id;
  }

  async getCityId(stateId: string, cityName: string): Promise<string> {
    const cities = this.getCache('cities');
    if (!cities) throw new Error('Cities cache not loaded');
    
    const stateCities = cities[stateId];
    if (!stateCities) {
      console.warn(`[FaramoveDataService] No cities found for state: ${stateId}, using fallback`);
      return 'other'; // Fallback city ID
    }
    
    const city = stateCities.find((c: any) => c.name.toLowerCase() === cityName.trim().toLowerCase());
    if (!city) {
      console.warn(`[FaramoveDataService] City not found: ${cityName} in state ${stateId}, using fallback`);
      return stateCities[0]?.id || 'other'; // Use first available city or fallback
    }
    
    return city.id;
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats() {
    const states = this.getCache('states');
    const weightRanges = this.getCache('weightRanges');
    const cities = this.getCache('cities');
    
    return {
      statesCount: states ? states.size : 0,
      weightRangesCount: weightRanges ? weightRanges.length : 0,
      citiesCount: cities ? Object.keys(cities).length : 0,
      lastUpdated: this.lastUpdated,
      isInitialized: !!(states && weightRanges && cities)
    };
  }

  /**
   * Force refresh data (useful for manual updates)
   */
  async forceRefresh(): Promise<void> {
    this.logger.logDataService('Force refresh requested');
    await this.refreshAllData();
  }
}
