import { registerAs } from '@nestjs/config';

export default registerAs('telegram', () => ({
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  agentUrl: process.env.NODE_ENV === 'production'
    ? process.env.AGENT_SERVICE_URL || 'http://agent.railway.internal:3001'
    : process.env.AGENT_SERVICE_URL || 'http://localhost:3001',
  webhookEnabled: process.env.NODE_ENV === 'production',
  webhookDomain: process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : process.env.WEBHOOK_DOMAIN,
  webhookPath: process.env.WEBHOOK_PATH || '/api/telegram/webhook',
}));
