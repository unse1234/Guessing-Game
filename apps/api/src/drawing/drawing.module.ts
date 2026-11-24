import { Module } from '@nestjs/common';
import { GameModule } from '../game/game.module';
import { RoomsModule } from '../rooms/rooms.module';
import { DrawingGateway } from './drawing.gateway';
import { DrawingService } from './drawing.service';

@Module({
  imports: [GameModule, RoomsModule],
  providers: [DrawingService, DrawingGateway],
})
export class DrawingModule {}
