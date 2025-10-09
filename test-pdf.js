#!/usr/bin/env node

const { createToolRegistry } = require('./dist/libs/mcp/tools/src/lib/tool-registry.js');

async function testPDF() {
  console.log('🧪 Testing PDF Generation...\n');

  const registry = createToolRegistry();

  // Test PDF generation
  console.log('📄 Testing generate_pdf tool');
  try {
    const result = await registry.executeTool('generate_pdf', {
      ticker: 'AAPL',
      content: '# Test Report\n\nThis is a test executive summary for Apple Inc.',
      reportType: 'summary'
    });

    console.log('✅ PDF Generation Result:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ PDF Generation Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testPDF().catch(console.error);
