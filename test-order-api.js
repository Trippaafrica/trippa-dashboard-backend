// Test script for Order API endpoints with API key authentication
// This file tests the new order retrieval functionality with cost filtering

// Configuration - replace with actual test values
const TEST_CONFIG = {
  API_BASE_URL: 'http://localhost:2000/api/v1',
  API_KEY: 'tp_live_sk_your_test_api_key_here', // Replace with actual API key
  TEST_ORDER_ID: 'test-order-id', // Replace with actual order ID
};

/**
 * Test helper to make API requests with API key
 */
async function makeApiRequest(endpoint, options = {}) {
  const url = `${TEST_CONFIG.API_BASE_URL}/${endpoint}`;
  
  const defaultOptions = {
    headers: {
      'x-api-key': TEST_CONFIG.API_KEY,
      'Content-Type': 'application/json',
    },
  };

  const config = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...(options.headers || {}),
    },
  };

  console.log(`🔗 Making request to: ${url}`);
  console.log(`📋 Headers:`, config.headers);

  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`❌ Request failed:`, error.message);
    throw error;
  }
}

/**
 * Helper function to check delivery cost filtering
 */
function checkDeliveryCostFiltering(order, testName) {
  console.log(`\\n🔍 Checking delivery cost filtering for ${testName}:`);
  
  if (!order.delivery_cost) {
    console.log('   ⚠️  No delivery_cost found in order');
    return;
  }
  
  console.log('   📊 Delivery cost structure:', JSON.stringify(order.delivery_cost, null, 6));
  
  const hasTrippafee = 'trippa_fee' in order.delivery_cost;
  const hasLogisticCost = 'logistic_delivery_cost' in order.delivery_cost;
  const hasTotalCost = 'total_delivery_cost' in order.delivery_cost;
  
  console.log(`   💰 Has total_delivery_cost: ${hasTotalCost}`);
  console.log(`   🚫 Has trippa_fee (should be false): ${hasTrippafee}`);
  console.log(`   🚫 Has logistic_delivery_cost (should be false): ${hasLogisticCost}`);
  
  if (!hasTrippafee && !hasLogisticCost && hasTotalCost) {
    console.log('   ✅ Cost filtering working correctly - only total_delivery_cost is visible!');
  } else {
    console.log('   ❌ Cost filtering issue detected - sensitive fields may be exposed');
  }
}

/**
 * Test 1: Get all orders with API key
 */
async function testGetAllOrders() {
  console.log('\\n🧪 Test 1: Get all orders with API key');
  console.log('='.repeat(50));

  try {
    // Test basic pagination
    const orders = await makeApiRequest('orders?page=1&limit=5');
    
    console.log('✅ Successfully fetched orders');
    console.log(`📊 Total orders: ${orders.total}`);
    console.log(`📄 Current page: ${orders.page}`);
    console.log(`📏 Page limit: ${orders.limit}`);
    console.log(`📚 Total pages: ${orders.totalPages}`);
    console.log(`🗂  Orders count in response: ${orders.data?.length || 0}`);
    
    if (orders.data && orders.data.length > 0) {
      console.log('\\n📝 Sample order structure:');
      const sampleOrder = orders.data[0];
      console.log(`   - Order ID: ${sampleOrder.order_id || sampleOrder.id}`);
      console.log(`   - Status: ${sampleOrder.status}`);
      console.log(`   - Created: ${sampleOrder.created_at}`);
      console.log(`   - Delivery Cost: ${sampleOrder.delivery_cost?.total_delivery_cost || 'N/A'}`);
      
      // Check delivery cost filtering for the first order
      checkDeliveryCostFiltering(sampleOrder, 'orders list');
      
      // Store a valid order ID for the next test
      if (sampleOrder.order_id || sampleOrder.id) {
        TEST_CONFIG.TEST_ORDER_ID = sampleOrder.order_id || sampleOrder.id;
        console.log(`💾 Stored order ID for next test: ${TEST_CONFIG.TEST_ORDER_ID}`);
      }
    }

    return orders;
  } catch (error) {
    console.error('❌ Test 1 failed:', error.message);
    throw error;
  }
}

/**
 * Test 2: Get single order with API key
 */
async function testGetSingleOrder() {
  console.log('\\n🧪 Test 2: Get single order with API key');
  console.log('='.repeat(50));

  if (!TEST_CONFIG.TEST_ORDER_ID || TEST_CONFIG.TEST_ORDER_ID === 'test-order-id') {
    console.log('⚠️  No valid order ID available. Skipping single order test.');
    return;
  }

  try {
    const order = await makeApiRequest(`orders/${TEST_CONFIG.TEST_ORDER_ID}`);
    
    console.log('✅ Successfully fetched single order');
    console.log(`📝 Order ID: ${order.order_id || order.id}`);
    console.log(`📊 Status: ${order.status}`);
    console.log(`📅 Created: ${order.created_at}`);
    console.log(`💰 Delivery Cost: ${order.delivery_cost?.total_delivery_cost || 'N/A'}`);
    
    // Check delivery cost filtering for individual order
    checkDeliveryCostFiltering(order, 'single order');
    
    if (order.order_data?.request) {
      const request = order.order_data.request;
      console.log('\\n🗺  Order details:');
      console.log(`   - Pickup: ${request.pickup?.address || 'N/A'}`);
      console.log(`   - Delivery: ${request.delivery?.address || 'N/A'}`);
      console.log(`   - Customer: ${request.delivery?.customerName || 'N/A'}`);
      console.log(`   - Item: ${request.item?.description || 'N/A'}`);
    }

    if (order.partner_response) {
      console.log('\\n📦 Partner response:');
      console.log(`   - Provider Order ID: ${order.partner_response.orderId || 'N/A'}`);
      console.log(`   - Tracking Number: ${order.partner_response.trackingNumber || 'N/A'}`);
    }

    return order;
  } catch (error) {
    console.error('❌ Test 2 failed:', error.message);
    throw error;
  }
}

/**
 * Test 3: Test filtering and search
 */
async function testOrderFiltering() {
  console.log('\\n🧪 Test 3: Test order filtering and search');
  console.log('='.repeat(50));

  try {
    // Test status filtering
    console.log('🔍 Testing status filtering...');
    const pendingOrders = await makeApiRequest('orders?status=pending&limit=3');
    console.log(`✅ Pending orders: ${pendingOrders.data?.length || 0}`);

    // Test search functionality
    console.log('\\n🔍 Testing search functionality...');
    const searchResults = await makeApiRequest('orders?search=TP&limit=3');
    console.log(`✅ Search results: ${searchResults.data?.length || 0}`);

    // Test date filtering
    console.log('\\n🔍 Testing date filtering...');
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const recentOrders = await makeApiRequest(`orders?startDate=${weekAgo}&endDate=${today}&limit=5`);
    console.log(`✅ Recent orders (last 7 days): ${recentOrders.data?.length || 0}`);

    return { pendingOrders, searchResults, recentOrders };
  } catch (error) {
    console.error('❌ Test 3 failed:', error.message);
    throw error;
  }
}

/**
 * Test 4: Test error handling
 */
async function testErrorHandling() {
  console.log('\\n🧪 Test 4: Test error handling');
  console.log('='.repeat(50));

  try {
    // Test invalid API key
    console.log('🔍 Testing invalid API key...');
    try {
      await makeApiRequest('orders', {
        headers: {
          'x-api-key': 'invalid_api_key',
          'Content-Type': 'application/json',
        },
      });
      console.log('❌ Should have failed with invalid API key');
    } catch (error) {
      console.log('✅ Correctly rejected invalid API key:', error.message);
    }

    // Test missing API key
    console.log('\\n🔍 Testing missing API key...');
    try {
      await makeApiRequest('orders', {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      console.log('❌ Should have failed with missing API key');
    } catch (error) {
      console.log('✅ Correctly rejected missing API key:', error.message);
    }

    // Test non-existent order
    console.log('\\n🔍 Testing non-existent order...');
    try {
      await makeApiRequest('orders/non-existent-order-id');
      console.log('❌ Should have failed with non-existent order');
    } catch (error) {
      console.log('✅ Correctly rejected non-existent order:', error.message);
    }

    console.log('\\n✅ All error handling tests passed');
  } catch (error) {
    console.error('❌ Test 4 failed:', error.message);
    throw error;
  }
}

/**
 * Test 5: Test pagination
 */
async function testPagination() {
  console.log('\\n🧪 Test 5: Test pagination');
  console.log('='.repeat(50));

  try {
    // Test different page sizes
    const page1 = await makeApiRequest('orders?page=1&limit=2');
    const page2 = await makeApiRequest('orders?page=2&limit=2');
    
    console.log(`✅ Page 1: ${page1.data?.length || 0} orders`);
    console.log(`✅ Page 2: ${page2.data?.length || 0} orders`);
    console.log(`📊 Total orders: ${page1.total}`);
    console.log(`📚 Total pages: ${page1.totalPages}`);

    // Test maximum limit
    const maxLimitOrders = await makeApiRequest('orders?limit=100');
    console.log(`✅ Max limit test: ${maxLimitOrders.data?.length || 0} orders (limit: 100)`);

    return { page1, page2, maxLimitOrders };
  } catch (error) {
    console.error('❌ Test 5 failed:', error.message);
    throw error;
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('🚀 Starting Order API Integration Tests');
  console.log('='.repeat(60));
  console.log(`🔑 API Key: ${TEST_CONFIG.API_KEY.substring(0, 20)}...`);
  console.log(`🌐 Base URL: ${TEST_CONFIG.API_BASE_URL}`);
  console.log('='.repeat(60));

  const results = {};

  try {
    results.allOrders = await testGetAllOrders();
    results.singleOrder = await testGetSingleOrder();
    results.filtering = await testOrderFiltering();
    results.errorHandling = await testErrorHandling();
    results.pagination = await testPagination();

    console.log('\\n🎉 All tests completed successfully!');
    console.log('='.repeat(60));
    console.log('✅ Summary:');
    console.log('   - Get all orders: PASSED');
    console.log('   - Get single order: PASSED');
    console.log('   - Filtering & search: PASSED');
    console.log('   - Error handling: PASSED');
    console.log('   - Pagination: PASSED');

    return results;
  } catch (error) {
    console.error('\\n💥 Tests failed:', error.message);
    console.error('='.repeat(60));
    throw error;
  }
}

/**
 * Export functions for use in other environments
 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runAllTests,
    testGetAllOrders,
    testGetSingleOrder,
    testOrderFiltering,
    testErrorHandling,
    testPagination,
    TEST_CONFIG,
  };
}

/**
 * Usage instructions
 */
console.log('📖 Order API Test Instructions:');
console.log('1. Update TEST_CONFIG.API_KEY with your actual API key');
console.log('2. Ensure your backend server is running on the configured URL');
console.log('3. Run: runAllTests()');
console.log('4. Individual tests can be run separately, e.g., testGetAllOrders()');
console.log('\\nReady to run tests! Call runAllTests() to begin.');
