# Provider Rate Limiting Implementation

## Overview

This implementation adds provider-specific rate limiting to prevent API abuse and ensure compliance with logistics providers' rate limits. The system is designed to be flexible, configurable, and easily extensible.

## Features

- **Provider-specific limits**: Different rate limits for each logistics provider
- **Configurable via environment variables**: Easily adjust limits without code changes
- **Smart request management**: Automatic waiting and backoff when limits are exceeded
- **Real-time monitoring**: API endpoints to check current rate limit status
- **Memory-efficient**: Uses sliding window approach with automatic cleanup

## Configuration

### Environment Variables

Add these optional environment variables to your `.env` file to override default rate limits:

```env
# Fez Rate Limiting
FEZ_RATE_LIMIT_REQUESTS=60
FEZ_RATE_LIMIT_WINDOW_MS=60000

# Faramove Rate Limiting
FARAMOVE_RATE_LIMIT_REQUESTS=100
FARAMOVE_RATE_LIMIT_WINDOW_MS=60000

# Glovo Rate Limiting
GLOVO_RATE_LIMIT_REQUESTS=120
GLOVO_RATE_LIMIT_WINDOW_MS=60000

# Gig Rate Limiting
GIG_RATE_LIMIT_REQUESTS=100
GIG_RATE_LIMIT_WINDOW_MS=60000

# DHL Rate Limiting
DHL_RATE_LIMIT_REQUESTS=50
DHL_RATE_LIMIT_WINDOW_MS=60000
```

### Default Limits

If no environment variables are set, these conservative defaults are used:

| Provider | Requests/Min | Window |
|----------|-------------|---------|
| Fez      | 60          | 1 min   |
| Faramove | 100         | 1 min   |
| Glovo    | 120         | 1 min   |
| Gig      | 100         | 1 min   |
| DHL      | 50          | 1 min   |

## API Endpoints

### Check Rate Limit Status for a Provider

```
GET /utils/rate-limiter/:provider/status
```

**Example Response:**
```json
{
  "provider": "fez",
  "remainingRequests": 45,
  "timeUntilResetMs": 30000,
  "timeUntilResetSeconds": 30
}
```

### Check All Providers Status

```
GET /utils/rate-limiter/status
```

**Example Response:**
```json
{
  "fez": {
    "remainingRequests": 45,
    "timeUntilResetMs": 30000,
    "timeUntilResetSeconds": 30
  },
  "faramove": {
    "remainingRequests": 98,
    "timeUntilResetMs": 0,
    "timeUntilResetSeconds": 0
  }
}
```

### Update Rate Limit Configuration

```
PATCH /utils/rate-limiter/:provider/config
Content-Type: application/json

{
  "maxRequests": 80,
  "windowMs": 60000
}
```

## Implementation Details

### How It Works

1. **Sliding Window**: Uses a sliding window approach where requests are tracked with timestamps
2. **Automatic Cleanup**: Old requests outside the time window are automatically removed
3. **Smart Waiting**: When limits are exceeded, the system can automatically wait for the window to reset
4. **Provider Integration**: Each provider adapter checks rate limits before making requests

### Integration in Fez Adapter

The Fez adapter now includes rate limiting in all API methods:

- **getQuote()**: Checks limit before making cost and time estimate requests
- **createOrder()**: Checks limit before order creation
- **trackOrder()**: Checks limit before tracking requests
- **cancelOrder()**: Checks limit before cancellation requests
- **authenticate()**: Checks limit before authentication requests

### Error Handling

When rate limits are exceeded, the system provides helpful error messages:

```
Fez rate limit exceeded. Try again in 30 seconds.
```

## Usage Examples

### Manual Rate Limit Check

```typescript
// Check if request is allowed
const isAllowed = await this.rateLimiter.checkRateLimit('fez');
if (!isAllowed) {
  throw new Error('Rate limit exceeded');
}
```

### Automatic Waiting

```typescript
// Wait for rate limit to allow request
await this.rateLimiter.waitForRateLimit('fez');
// Request will now be allowed
await this.makeApiCall();
```

### Get Status Information

```typescript
const remaining = this.rateLimiter.getRemainingRequests('fez');
const resetTime = this.rateLimiter.getTimeUntilReset('fez');
console.log(`${remaining} requests remaining, resets in ${resetTime}ms`);
```

## Benefits

1. **API Protection**: Prevents overwhelming provider APIs
2. **Compliance**: Ensures adherence to provider rate limits
3. **Better Error Handling**: Graceful degradation when limits are hit
4. **Monitoring**: Real-time visibility into API usage
5. **Flexibility**: Easy to adjust limits based on provider feedback
6. **Scalability**: Memory-efficient design that scales with usage

## Monitoring and Alerting

- Monitor the rate limit status endpoints to track API usage patterns
- Set up alerts when providers consistently hit rate limits
- Use the configuration endpoint to adjust limits dynamically based on provider feedback

## Future Enhancements

- Add metrics and logging integration
- Implement different rate limiting strategies (burst allowance, etc.)
- Add provider-specific retry strategies
- Integrate with external rate limiting services (Redis, etc.)
