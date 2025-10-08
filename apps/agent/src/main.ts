import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  app.enableCors({
    origin: '*',
    credentials: true,
  });

  const port = process.env.AGENT_PORT || process.env.PORT || 3001;
  const host = '0.0.0.0';

  await app.listen(port, host);

  Logger.log(`Agent API running on ${host}:${port}`, 'Bootstrap');

  if (process.env.RAILWAY_PRIVATE_DOMAIN) {
    Logger.log(
      `Internal URL: http://${process.env.RAILWAY_PRIVATE_DOMAIN}:${port}`,
      'Bootstrap'
    );
  }
}

bootstrap();
