import { Module } from '@nestjs/common';
import { ApiModule } from '@stock-analyzer/agent/api';

@Module({
  imports: [ApiModule],
})
export class AppModule {}
