export class CreateScheduledShipmentDto {
  partner: string; // e.g. 'glovo', 'faramove', etc.
  partnerId?: string; // Partner ID from database or quote response
  request: any; // Same as CreateOrderDto.request
  scheduledDate?: string; // Only present for scheduled shipments
  quote?: { price: number }; // Selected quote for cost calculation
}
