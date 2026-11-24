import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SocketIoAdapter } from './common/socket-io.adapter';
import type { Environment } from './common/environment';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Environment, true>);
  const origin = config.get('FRONTEND_URL', { infer: true });

  app.enableCors({ origin });
  app.useWebSocketAdapter(
    new SocketIoAdapter(
      app,
      origin,
      config.get('MAX_SOCKET_CONNECTIONS', { infer: true }),
    ),
  );
  app.enableShutdownHooks();
  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
