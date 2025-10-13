import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SESSION_REPOSITORY } from './interfaces';
import { InMemorySessionRepository } from './repositories/in-memory-session.repository';
import { SessionOrchestrator } from './session-orchestrator.service';

/**
 * SessionStore Module
 *
 * Provides session management infrastructure for Bot applications.
 *
 * Exports:
 * - SESSION_REPOSITORY token (bound to InMemorySessionRepository)
 * - SessionOrchestrator (high-level session lifecycle management)
 *
 * Usage:
 * ```typescript
 * @Module({
 *   imports: [SessionStoreModule],
 *   // Now you can inject SessionOrchestrator
 * })
 * export class MyModule {}
 * ```
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [
    {
      provide: SESSION_REPOSITORY,
      useClass: InMemorySessionRepository,
    },
    SessionOrchestrator,
  ],
  exports: [SESSION_REPOSITORY, SessionOrchestrator],
})
export class SessionStoreModule {}
