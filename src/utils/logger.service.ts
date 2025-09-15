import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AppLogger extends Logger {
  constructor(context?: string) {
    super(context);
  }

  // Log API requests and authentication events
  logApiAuth(message: string, data?: any) {
    this.log(`[API_AUTH] ${message}`, data ? JSON.stringify(data) : '');
  }

  // Log business operations
  logBusiness(message: string, data?: any) {
    this.log(`[BUSINESS] ${message}`, data ? JSON.stringify(data) : '');
  }

  // Log logistics operations
  logLogistics(message: string, data?: any) {
    this.log(`[LOGISTICS] ${message}`, data ? JSON.stringify(data) : '');
  }

  // Log tracking operations
  logTracking(message: string, data?: any) {
    this.log(`[TRACKING] ${message}`, data ? JSON.stringify(data) : '');
  }

  // Log aggregator operations
  logAggregator(message: string, data?: any) {
    this.log(`[AGGREGATOR] ${message}`, data ? JSON.stringify(data) : '');
  }

  // Log adapter operations
  logAdapter(adapterName: string, message: string, data?: any) {
    this.log(`[${adapterName.toUpperCase()}_ADAPTER] ${message}`, data ? JSON.stringify(data) : '');
  }

  // Log rate limiter operations
  logRateLimit(message: string, data?: any) {
    this.log(`[RATE_LIMIT] ${message}`, data ? JSON.stringify(data) : '');
  }

  // Log webhook operations
  logWebhook(message: string, data?: any) {
    this.log(`[WEBHOOK] ${message}`, data ? JSON.stringify(data) : '');
  }

  // Log wallet operations
  logWallet(message: string, data?: any) {
    this.log(`[WALLET] ${message}`, data ? JSON.stringify(data) : '');
  }

  // Log dispute operations
  logDispute(message: string, data?: any) {
    this.log(`[DISPUTE] ${message}`, data ? JSON.stringify(data) : '');
  }

  // Log data service operations
  logDataService(message: string, data?: any) {
    this.log(`[DATA_SERVICE] ${message}`, data ? JSON.stringify(data) : '');
  }
}
