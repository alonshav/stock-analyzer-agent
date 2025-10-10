const { Telegraf } = require('telegraf');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
console.log('Token loaded:', token ? 'YES' : 'NO');
console.log('Token preview:', token ? token.substring(0, 15) + '...' : 'N/A');

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN not found');
  process.exit(1);
}

const bot = new Telegraf(token);

console.log('\nAttempting bot.launch()...');
const timeout = setTimeout(() => {
  console.error('\n❌ Timeout after 30 seconds');
  process.exit(1);
}, 30000);

bot.launch()
  .then(() => {
    clearTimeout(timeout);
    console.log('\n✅ Bot successfully launched in polling mode!');
    console.log('Bot is now listening for messages...');
  })
  .catch((error) => {
    clearTimeout(timeout);
    console.error('\n❌ Bot launch failed:',error.message);
    console.error('Full error:', error);
    process.exit(1);
  });

// Handle stop signals
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
