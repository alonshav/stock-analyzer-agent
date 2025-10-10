const https = require('https');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
console.log('Token loaded:', token ? 'YES (length: ' + token.length + ')' : 'NO');
console.log('Token format:', token ? token.substring(0, 10) + '...' + token.substring(token.length - 10) : 'N/A');

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN not found in environment');
  process.exit(1);
}

const url = `https://api.telegram.org/bot${token}/getMe`;
console.log('Testing token with Telegram API...\n');

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const response = JSON.parse(data);
    console.log('Response:', JSON.stringify(response, null, 2));

    if (response.ok) {
      console.log('\n✅ Bot token is VALID');
      console.log('Bot username:', response.result.username);
      console.log('Bot name:', response.result.first_name);
    } else {
      console.log('\n❌ Bot token is INVALID');
      console.log('Error:', response.description);
    }
  });
}).on('error', (err) => {
  console.error('Network error:', err.message);
});
