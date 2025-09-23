# Order API Integration Guide

## Overview
This document explains how to use the Trippa API to retrieve order/shipment details using your API key.

## Authentication
All order endpoints support API key authentication by including your API key in the request headers:

```
x-api-key: your_api_key_here
```

## Available Endpoints

### 1. Get All Orders
Retrieve a paginated list of your orders/shipments.

**Endpoint:** `GET /orders`

**Headers:**
```
x-api-key: your_api_key_here
Content-Type: application/json
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 100)
- `status` (optional): Filter by status (e.g., "pending", "delivered", "in-transit")
- `search` (optional): Search by order ID or customer name
- `startDate` (optional): Filter orders from this date (ISO format)
- `endDate` (optional): Filter orders to this date (ISO format)

**Example Request:**
```bash
curl -X GET "https://api.trippa.com/orders?page=1&limit=20&status=pending" \
  -H "x-api-key: tp_live_sk_your_api_key_here" \
  -H "Content-Type: application/json"
```

**Example Response:**
```json
{
  "data": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "order_id": "TP-2024-001234",
      "status": "Pending",
      "created_at": "2024-08-18T10:30:00Z",
      "delivery_cost": {
        "total_delivery_cost": 2500,
        "base_cost": 2000,
        "insurance_cost": 500
      },
      "order_data": {
        "request": {
          "pickup": {
            "address": "123 Main St, Lagos",
            "state": "Lagos"
          },
          "delivery": {
            "address": "456 Oak Ave, Lagos",
            "customerName": "John Doe",
            "customerPhone": "08012345678"
          },
          "item": {
            "description": "Electronics package",
            "weight": 2.5,
            "value": 50000
          }
        }
      },
      "partner_response": {
        "orderId": "FEZ123456789",
        "trackingNumber": "TRK123456"
      }
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 45,
  "totalPages": 3
}
```

### 2. Get Single Order
Retrieve details of a specific order by its ID.

**Endpoint:** `GET /orders/{orderId}`

**Headers:**
```
x-api-key: your_api_key_here
Content-Type: application/json
```

**Path Parameters:**
- `orderId`: The order ID (can be UUID or custom order ID like "TP-2024-001234")

**Example Request:**
```bash
curl -X GET "https://api.trippa.com/orders/TP-2024-001234" \
  -H "x-api-key: tp_live_sk_your_api_key_here" \
  -H "Content-Type: application/json"
```

**Example Response:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "order_id": "TP-2024-001234",
  "status": "In-Transit",
  "created_at": "2024-08-18T10:30:00Z",
  "updated_at": "2024-08-18T14:20:00Z",
  "business_id": "business-uuid-here",
  "partner_id": "partner-uuid-here",
  "delivery_cost": {
    "total_delivery_cost": 2500,
    "base_cost": 2000,
    "insurance_cost": 500,
    "trippa_fee": 250
  },
  "order_data": {
    "request": {
      "pickup": {
        "address": "123 Main St, Lagos",
        "state": "Lagos",
        "city": "Lagos"
      },
      "delivery": {
        "address": "456 Oak Ave, Lagos",
        "state": "Lagos",
        "city": "Lagos",
        "customerName": "John Doe",
        "customerPhone": "08012345678"
      },
      "item": {
        "description": "Electronics package",
        "weight": 2.5,
        "value": 50000
      }
    }
  },
  "partner_response": {
    "orderId": "FEZ123456789",
    "trackingNumber": "TRK123456",
    "status": "in_transit"
  },
  "insurance_details": null
}
```

## Error Responses

### Invalid API Key
```json
{
  "statusCode": 400,
  "message": "Invalid API key or business not found",
  "error": "Bad Request"
}
```

### Order Not Found
```json
{
  "statusCode": 404,
  "message": "Order not found or access denied",
  "error": "Not Found"
}
```

### Missing Authentication
```json
{
  "statusCode": 404,
  "message": "Missing authentication: provide x-api-key or Bearer token",
  "error": "Not Found"
}
```

## Security Notes

1. **Access Control**: You can only access orders that belong to your business (based on your API key).
2. **API Key Security**: Keep your API key secure and never expose it in client-side code.
3. **Rate Limiting**: API calls may be rate-limited. Implement proper retry logic with exponential backoff.

## Integration Examples

### JavaScript/Node.js
```javascript
const axios = require('axios');

class TrippaOrderAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.trippa.com';
  }

  async getOrders(options = {}) {
    const { page = 1, limit = 10, status, search } = options;
    const params = new URLSearchParams({ page, limit });
    if (status) params.append('status', status);
    if (search) params.append('search', search);

    const response = await axios.get(`${this.baseURL}/orders?${params}`, {
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  }

  async getOrder(orderId) {
    const response = await axios.get(`${this.baseURL}/orders/${orderId}`, {
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  }
}

// Usage
const trippaAPI = new TrippaOrderAPI('tp_live_sk_your_api_key_here');

// Get all orders
const orders = await trippaAPI.getOrders({ page: 1, limit: 20 });

// Get specific order
const order = await trippaAPI.getOrder('TP-2024-001234');
```

### Python
```python
import requests

class TrippaOrderAPI:
    def __init__(self, api_key):
        self.api_key = api_key
        self.base_url = 'https://api.trippa.com'
        self.headers = {
            'x-api-key': api_key,
            'Content-Type': 'application/json'
        }

    def get_orders(self, page=1, limit=10, status=None, search=None):
        params = {'page': page, 'limit': limit}
        if status:
            params['status'] = status
        if search:
            params['search'] = search
            
        response = requests.get(
            f'{self.base_url}/orders',
            headers=self.headers,
            params=params
        )
        response.raise_for_status()
        return response.json()

    def get_order(self, order_id):
        response = requests.get(
            f'{self.base_url}/orders/{order_id}',
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

# Usage
trippa_api = TrippaOrderAPI('tp_live_sk_your_api_key_here')

# Get all orders
orders = trippa_api.get_orders(page=1, limit=20)

# Get specific order
order = trippa_api.get_order('TP-2024-001234')
```

## Related Endpoints

- **Create Order**: `POST /create-order` - Create new shipments
- **Get Quotes**: `POST /quotes` - Get delivery quotes
- **Track Order**: `GET /logistics/track/{orderId}` - Track order status
- **Wallet Balance**: `GET /wallet/balance` - Check wallet balance

For complete API documentation, visit: [Trippa API Documentation](https://docs.trippa.com)
