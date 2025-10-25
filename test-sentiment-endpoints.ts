/**
 * Test Script for FMP Sentiment Endpoints
 *
 * Tests all sentiment-related endpoints to verify they work correctly
 */

// Load environment variables
import * as dotenv from 'dotenv';
dotenv.config();

import { FMPAdapter } from './libs/mcp/integrations/src/lib/fmp/fmp.adapter';

async function testSentimentEndpoints() {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    console.error('❌ FMP_API_KEY environment variable not set');
    process.exit(1);
  }

  const adapter = new FMPAdapter(apiKey);
  const testTicker = 'AAPL';

  console.log(`🧪 Testing FMP Sentiment Endpoints for ${testTicker}\n`);
  console.log('='.repeat(60));

  // Test 1: Stock News Sentiment
  console.log('\n1️⃣ Testing Stock News Sentiment...');
  try {
    const newsSentiment = await adapter.getStockNewsSentiment(testTicker);
    console.log(`✅ Success! Retrieved ${newsSentiment.length} news sentiment items`);
    if (newsSentiment.length > 0) {
      console.log(`   Sample: "${newsSentiment[0].title}" - Sentiment: ${newsSentiment[0].sentiment}`);
    }
  } catch (error) {
    console.error(`❌ Failed:`, error instanceof Error ? error.message : error);
  }

  // Test 2: Social Sentiment
  console.log('\n2️⃣ Testing Social Sentiment...');
  try {
    const socialSentiment = await adapter.getSocialSentiment(testTicker);
    if (socialSentiment) {
      console.log(`✅ Success! Retrieved social sentiment data`);
      console.log(`   Classification: ${socialSentiment.sentimentClassification}`);
      console.log(`   Sentiment Score: ${socialSentiment.sentiment}`);
      console.log(`   Reddit Posts: ${socialSentiment.redditPosts}`);
      console.log(`   Twitter Posts: ${socialSentiment.twitterPosts}`);
    } else {
      console.log(`⚠️  No social sentiment data available for ${testTicker}`);
    }
  } catch (error) {
    console.error(`❌ Failed:`, error instanceof Error ? error.message : error);
  }

  // Test 3: Social Sentiment Changes
  console.log('\n3️⃣ Testing Social Sentiment Changes...');
  try {
    const sentimentChanges = await adapter.getSocialSentimentChanges(testTicker);
    if (sentimentChanges.length > 0) {
      console.log(`✅ Success! Retrieved ${sentimentChanges.length} sentiment change records`);
      console.log(`   Latest change: ${sentimentChanges[0].sentimentChange} (${sentimentChanges[0].percentChange}%)`);
    } else {
      console.log(`⚠️  No sentiment changes data available (endpoint may not exist)`);
    }
  } catch (error) {
    console.error(`❌ Failed:`, error instanceof Error ? error.message : error);
  }

  // Test 4: Stock Grades
  console.log('\n4️⃣ Testing Stock Grades...');
  try {
    const grades = await adapter.getStockGrades(testTicker, 5);
    console.log(`✅ Success! Retrieved ${grades.length} stock grades`);
    if (grades.length > 0) {
      console.log(`   Latest: ${grades[0].gradingCompany} - ${grades[0].previousGrade} → ${grades[0].newGrade}`);
      console.log(`   Date: ${grades[0].date}`);
    }
  } catch (error) {
    console.error(`❌ Failed:`, error instanceof Error ? error.message : error);
  }

  // Test 5: Stock News
  console.log('\n5️⃣ Testing Stock News...');
  try {
    const news = await adapter.getStockNews(testTicker, 5);
    console.log(`✅ Success! Retrieved ${news.length} news articles`);
    if (news.length > 0) {
      console.log(`   Latest: "${news[0].title}"`);
      console.log(`   Published: ${news[0].publishedDate}`);
      console.log(`   Source: ${news[0].site}`);
    }
  } catch (error) {
    console.error(`❌ Failed:`, error instanceof Error ? error.message : error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n✨ Testing complete!\n');
}

// Run tests
testSentimentEndpoints().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
