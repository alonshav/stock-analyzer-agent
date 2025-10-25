/**
 * Verbose Test Script for FMP Sentiment Endpoints
 * Shows actual API responses and error details
 */

import * as dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

async function verboseTest() {
  const apiKey = process.env.FMP_API_KEY;
  const baseURL = 'https://financialmodelingprep.com/api';
  const testTicker = 'AAPL';

  if (!apiKey) {
    console.error('❌ FMP_API_KEY not set');
    return;
  }

  console.log(`🔍 Verbose FMP API Testing for ${testTicker}\n`);
  console.log('='.repeat(70));

  // Test basic connection first
  console.log('\n🔌 Testing basic API connection...');
  try {
    const response = await axios.get(`${baseURL}/v3/stock-list?limit=5&apikey=${apiKey}`);
    console.log(`✅ API Key works! Retrieved ${response.data?.length || 0} stocks`);
  } catch (error: any) {
    console.error(`❌ Basic connection failed:`, error.response?.status, error.response?.statusText);
    console.error('Response:', error.response?.data);
    return;
  }

  // Test each endpoint with full response logging
  const tests = [
    {
      name: 'Stock News Sentiments RSS Feed',
      url: `${baseURL}/v4/stock-news-sentiments-rss-feed?page=0&apikey=${apiKey}`,
    },
    {
      name: 'Historical Social Sentiment',
      url: `${baseURL}/v4/historical/social-sentiment?symbol=${testTicker}&page=0&apikey=${apiKey}`,
    },
    {
      name: 'Social Sentiments Change',
      url: `${baseURL}/v4/social-sentiments/change?symbol=${testTicker}&apikey=${apiKey}`,
    },
    {
      name: 'Stock Grades',
      url: `${baseURL}/v3/grade/${testTicker}?limit=5&apikey=${apiKey}`,
    },
    {
      name: 'Stock News',
      url: `${baseURL}/v3/stock_news?tickers=${testTicker}&limit=5&apikey=${apiKey}`,
    },
  ];

  for (const test of tests) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📡 Testing: ${test.name}`);
    console.log(`🔗 URL: ${test.url.replace(apiKey, 'API_KEY')}`);

    try {
      const response = await axios.get(test.url);
      const data = response.data;

      console.log(`✅ Status: ${response.status} ${response.statusText}`);
      console.log(`📦 Response type: ${Array.isArray(data) ? 'Array' : typeof data}`);
      console.log(`📊 Data length: ${Array.isArray(data) ? data.length : 'N/A'}`);

      if (Array.isArray(data) && data.length > 0) {
        console.log(`\n🔍 Sample data (first item):`);
        console.log(JSON.stringify(data[0], null, 2));
      } else if (!Array.isArray(data) && data) {
        console.log(`\n🔍 Response data:`);
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(`⚠️  Empty response - no data available`);
      }
    } catch (error: any) {
      console.error(`❌ Failed with status: ${error.response?.status}`);
      console.error(`💬 Message: ${error.response?.statusText}`);
      if (error.response?.data) {
        console.error(`📄 Response:`, JSON.stringify(error.response.data, null, 2));
      }
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('\n✨ Verbose testing complete!\n');
}

verboseTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
