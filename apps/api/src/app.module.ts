import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { environmentSchema } from './common/environment';
import { HealthController } from './common/health.controller';
import { SocketGateway } from './common/socket.gateway';
import { DrawingModule } from './drawing/drawing.module';
import { GameModule } from './game/game.module';
import { RoomsModule } from './rooms/rooms.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (environment) => environmentSchema.parse(environment),
    }),
    RoomsModule,
    GameModule,
    DrawingModule,
  ],
  controllers: [HealthController],
  providers: [SocketGateway],
})
export class AppModule {}
