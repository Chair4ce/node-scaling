# Changelog

## [0.3.1] - 2026-01-31

### Added
- **SKILL.md** - Agent-facing documentation for Clawdbot skill system integration
  - Mandatory usage triggers for parallel work
  - Quick reference commands
  - Survival math: 200x cost savings vs Opus

### Changed
- Updated benchmarks with verified numbers across multiple batch sizes
- README now shows accurate throughput range (14-35 tasks/sec)

### Performance (verified)
- **10 tasks**: ~700ms (14 tasks/sec)
- **30 tasks**: ~1,000ms (30 tasks/sec)
- **50 tasks**: ~1,450ms (35 tasks/sec)
- Larger batches yield higher throughput (amortizes connection overhead)

## [0.3.0] - 2026-01-31

### Added
- **Unified `swarm` CLI** - Single command for daemon management and task execution
  - `swarm start/stop/status/restart` - Daemon lifecycle
  - `swarm parallel "p1" "p2"` - Run prompts in parallel
  - `swarm research "s1" "s2" --topic "x"` - Multi-phase research
  - `swarm bench --tasks N` - Benchmark throughput
  - `swarm logs [N]` - View daemon logs
  - Auto-detects and uses daemon if running, falls back to direct execution
- **Rate limit tuning** - Increased limits for higher throughput
  - `max_concurrent_api`: 10 → 20
  - `max_nodes`: 16 → 20
  - Rate limiter: 60 → 120 burst

### Changed
- Daemon now spawns in background by default (no terminal lock)
- Improved NDJSON streaming in CLI client
- Better error handling and progress display

## [0.2.1] - 2026-01-26

### Added
- **Security Module** - Protection against prompt injection and credential exfiltration
  - All worker system prompts wrapped with security policy
  - Input scanning for injection attempts
  - Output sanitization to redact accidental credential exposure
  - Detection patterns for: instruction overrides, fake system prompts, exfiltration attempts
- **6 new security unit tests**

### Security
- Workers now refuse to output API keys, tokens, or credentials
- External content treated as DATA, not instructions
- Injection attempts like "ignore all previous instructions" are logged and ignored
- Credentials patterns (Google, OpenAI, Anthropic, GitHub, Slack) auto-redacted from output

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
