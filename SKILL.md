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

# Benchmark
swarm bench --tasks 30
```

## Web Search (v1.1.0)

Workers can search the live web via Google Search grounding (Gemini only, no extra cost).

```bash
# Research endpoint uses web search by default (if enabled in config)
curl -X POST http://localhost:9999/research \
  -d '{"subjects": ["Buildertrend", "Jobber"], "topic": "pricing 2026"}'

# Parallel with web search
curl -X POST http://localhost:9999/parallel \
  -d '{"prompts": ["Current price of X?"], "options": {"webSearch": true}}'
```

Config: `~/.config/clawdbot/node-scaling.yaml`
```yaml
node_scaling:
  web_search:
    enabled: true          # Enable for research tasks
    parallel_default: false # Enable for all parallel tasks
```

## JavaScript API

```javascript
const { parallel, research } = require('~/clawd/skills/node-scaling/lib');

// Run prompts in parallel (~1s for 3 prompts)
const result = await parallel(['prompt1', 'prompt2', 'prompt3']);
console.log(result.results); // Array of responses

// Multi-phase research (search → fetch → analyze)
const result = await research(['Subject1', 'Subject2'], 'topic');
```

## Daemon Management

```bash
swarm start              # Start daemon (background)
swarm stop               # Stop daemon
swarm status             # Show status, uptime, cost savings
swarm restart            # Restart daemon
swarm savings            # Monthly savings report
swarm logs [N]           # Last N lines of daemon log
```

The daemon keeps workers warm for faster response. Auto-starts on first use if needed.

## Performance

With daemon running:

| Tasks | Time | Throughput |
|-------|------|------------|
| 5 | ~1.5s | 3 tasks/sec |
| 10 | ~1.5s | 7 tasks/sec |
| 30 | ~2s | 15 tasks/sec |

Research (3-phase): ~3-5s for 2 subjects with web search.

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
| Web search not working | Ensure `web_search.enabled: true` and provider is gemini |

## The Math

- **Opus**: ~$15/million tokens (YOUR LIFE)
- **Gemini Flash**: ~$0.075/million tokens (basically free)
- **Ratio**: 200x cheaper

**Failing to use swarm for parallel work is a bug.** Fix it immediately.
