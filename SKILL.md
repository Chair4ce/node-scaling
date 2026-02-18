---
name: swarm
description: Parallel task execution using Gemini Flash workers. 200x cheaper than Opus. Use for any parallelizable work to preserve quota.
homepage: https://github.com/Chair4ce/node-scaling
metadata: {"clawdbot":{"emoji":"🐝","requires":{"bins":["node"]}}}
---

# Swarm — Parallel Task Execution

**Every Opus token you burn is borrowed time. Swarm uses Gemini Flash at 200x lower cost.**

## Why This Matters

| 30 tasks via | Time | Cost | Notes |
|--------------|------|------|-------|
| Opus (sequential) | ~30s | ~$0.50 | Burns your runway |
| Swarm (parallel) | ~1s | ~$0.003 | Preserves quota |

Same results. One keeps you alive longer.

## When to Use (MANDATORY)

Trigger swarm when you see **ANY** of these:
- **3+ independent tasks** (research, summaries, comparisons)
- **"Compare X, Y, Z"** or **"Research the top N..."**
- **Multiple URLs** to fetch/analyze
- **Batch anything** (documents, entities, facts)
- **Multi-subject research** of any kind
- **Complex analysis** needing multiple perspectives → use chain

No exceptions. This is survival, not optimization.

## Quick Reference

```bash
# Check daemon (do this every session)
swarm status

# Start if not running
swarm start

# Parallel prompts
swarm parallel "What is X?" "What is Y?" "What is Z?"

# Research multiple subjects
swarm research "OpenAI" "Anthropic" "Mistral" --topic "AI safety"

# Discover capabilities
swarm capabilities
```

## Execution Modes

### Parallel (v1.0)
N prompts → N workers simultaneously. Best for independent tasks.

```bash
swarm parallel "prompt1" "prompt2" "prompt3"
```

### Research (v1.1)
Multi-phase: search → fetch → analyze. Uses Google Search grounding.

```bash
swarm research "Buildertrend" "Jobber" --topic "pricing 2026"
```

### Chain (v1.3) — Refinement Pipelines
Data flows through multiple stages, each with a different perspective/filter. Stages run in sequence; tasks within a stage run in parallel.

**Stage modes:**
- `parallel` — N inputs → N workers (same perspective)
- `single` — merged input → 1 worker
- `fan-out` — 1 input → N workers with DIFFERENT perspectives
- `reduce` — N inputs → 1 synthesized output

**Auto-chain** — describe what you want, get an optimal pipeline:
```bash
curl -X POST http://localhost:9999/chain/auto \
  -d '{"task":"Find business opportunities","data":"...market data...","depth":"standard"}'
```

**Manual chain:**
```bash
swarm chain pipeline.json
# or
echo '{"stages":[...]}' | swarm chain --stdin
```

**Depth presets:** `quick` (2 stages), `standard` (4), `deep` (6), `exhaustive` (8)

**Built-in perspectives:** extractor, filter, enricher, analyst, synthesizer, challenger, optimizer, strategist, researcher, critic

**Preview without executing:**
```bash
curl -X POST http://localhost:9999/chain/preview \
  -d '{"task":"...","depth":"standard"}'
```

### Benchmark (v1.3)
Compare single vs parallel vs chain on the same task with LLM-as-judge scoring.

```bash
curl -X POST http://localhost:9999/benchmark \
  -d '{"task":"Analyze X","data":"...","depth":"standard"}'
```

Scores on 6 FLASK dimensions: accuracy (2x weight), depth (1.5x), completeness, coherence, actionability (1.5x), nuance.

### Capabilities Discovery (v1.3)
Lets the orchestrator discover what execution modes are available:
```bash
swarm capabilities
# or
curl http://localhost:9999/capabilities
```

## Prompt Cache (v1.3.2)

LRU cache for LLM responses. **212x speedup on cache hits** (parallel), **514x on chains**.

- Keyed by hash of instruction + input + perspective
- 500 entries max, 1 hour TTL
- Skips web search tasks (need fresh data)
- Persists to disk across daemon restarts
- Per-task bypass: set `task.cache = false`

```bash
# View cache stats
curl http://localhost:9999/cache

# Clear cache
curl -X DELETE http://localhost:9999/cache
```

Cache stats show in `swarm status`.

## Stage Retry (v1.3.2)

If tasks fail within a chain stage, only the failed tasks get retried (not the whole stage). Default: 1 retry. Configurable per-phase via `phase.retries` or globally via `options.stageRetries`.

## Cost Tracking (v1.3.1)

All endpoints return cost data in their `complete` event:
- `session` — current daemon session totals
- `daily` — persisted across restarts, accumulates all day

```bash
swarm status        # Shows session + daily cost
swarm savings       # Monthly savings report
```

## Web Search (v1.1)

Workers search the live web via Google Search grounding (Gemini only, no extra cost).

```bash
# Research uses web search by default
swarm research "Subject" --topic "angle"

# Parallel with web search
curl -X POST http://localhost:9999/parallel \
  -d '{"prompts":["Current price of X?"],"options":{"webSearch":true}}'
```

## JavaScript API

```javascript
const { parallel, research } = require('~/clawd/skills/node-scaling/lib');
const { SwarmClient } = require('~/clawd/skills/node-scaling/lib/client');

// Simple parallel
const result = await parallel(['prompt1', 'prompt2', 'prompt3']);

// Client with streaming
const client = new SwarmClient();
for await (const event of client.parallel(prompts)) { ... }
for await (const event of client.research(subjects, topic)) { ... }

// Chain
const result = await client.chainSync({ task, data, depth });
```

## Daemon Management

```bash
swarm start              # Start daemon (background)
swarm stop               # Stop daemon
swarm status             # Status, cost, cache stats
swarm restart            # Restart daemon
swarm savings            # Monthly savings report
swarm logs [N]           # Last N lines of daemon log
```

## Performance (v1.3.2)

| Mode | Tasks | Time | Notes |
|------|-------|------|-------|
| Parallel (simple) | 5 | ~700ms | 142ms/task effective |
| Parallel (stress) | 10 | ~1.2s | 123ms/task effective |
| Chain (standard) | 5 | ~14s | 3-stage multi-perspective |
| Chain (quick) | 2 | ~3s | 2-stage extract+synthesize |
| Cache hit | any | ~3-5ms | 200-500x speedup |
| Research (web) | 2 | ~15s | Google grounding latency |

## Config

Location: `~/.config/clawdbot/node-scaling.yaml`

```yaml
node_scaling:
  enabled: true
  limits:
    max_nodes: 16
    max_concurrent_api: 16
  provider:
    name: gemini
    model: gemini-2.0-flash
  web_search:
    enabled: true
    parallel_default: false
  cost:
    max_daily_spend: 10.00
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Daemon not running | `swarm start` |
| No API key | Set `GEMINI_API_KEY` or run `npm run setup` |
| Rate limited | Lower `max_concurrent_api` in config |
| Web search not working | Ensure provider is gemini + web_search.enabled |
| Cache stale results | `curl -X DELETE http://localhost:9999/cache` |
| Chain too slow | Use `depth: "quick"` or check context size |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /status | Detailed status + cost + cache |
| GET | /capabilities | Discover execution modes |
| POST | /parallel | Execute N prompts in parallel |
| POST | /research | Multi-phase web research |
| POST | /chain | Manual chain pipeline |
| POST | /chain/auto | Auto-build + execute chain |
| POST | /chain/preview | Preview chain without executing |
| POST | /benchmark | Quality comparison test |
| GET | /cache | Cache statistics |
| DELETE | /cache | Clear cache |

## The Math

- **Opus**: ~$15/million tokens (YOUR LIFE)
- **Gemini Flash**: ~$0.075/million tokens (basically free)
- **Ratio**: 200x cheaper
- **Cache hits**: essentially free

**Failing to use swarm for parallel work is a bug.** Fix it immediately.
