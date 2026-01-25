# Changelog

## [0.2.0] - 2026-01-25

### Added
- **Swarm Daemon** - Long-running process with pre-warmed workers for instant TTFT
  - `swarm-daemon start/stop/status` CLI
  - `swarm` CLI client for quick requests
  - HTTP API on localhost:9999
- **User Feedback System** - Real-time progress visibility
  - Event system (`swarm:start`, `task:complete`, etc.)
  - Pretty console display with worker status
  - Streaming NDJSON responses
- **Diagnostics System** - Health checks and troubleshooting
  - `npm run diagnose` for system checks
  - Machine profiling with optimal worker recommendations
  - Auto-runs during setup
- **Test Suite** - 24 tests covering core functionality
  - Unit tests (events, display)
  - Integration tests (dispatcher, orchestration)
  - E2E tests (real API calls)
- **Immediate Acknowledgment Pattern** - UX best practice documented

### Changed
- Setup now runs diagnostics and tests automatically
- Cleaner repo structure (removed internal/marketing files)

### Performance
- **TTFT**: <10ms with daemon (vs ~500ms cold start)
- **Speedup**: 2-5x faster than sequential execution
- **6 subject research**: ~8 seconds (vs ~35 seconds sequential)

## [0.1.0] - 2026-01-25

### Added
- Initial release
- Parallel task execution with Gemini Flash workers
- Multi-phase orchestration (search → fetch → analyze)
- Support for multiple providers (Gemini, OpenAI, Anthropic, Groq)
- Code generation with CodeSwarm
- Metrics and performance tracking
