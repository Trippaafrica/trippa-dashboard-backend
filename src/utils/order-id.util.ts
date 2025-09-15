// utils/order-id.util.ts
export function generateCustomOrderId(): string {
  const random = Math.random().toString(36).substring(2, 12);
  return `TP-${random}`;
}
