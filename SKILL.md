---
name: swarm
description: Parallel task execution using Gemini Flash workers. 200x cheaper than Opus. Use for any parallelizable work to preserve quota.
homepage: https://github.com/Chair4ce/node-scaling
metadata:
  openclaw:
    emoji: "🐝"
    requires:
      bins:
        - node
      env:
        - GEMINI_API_KEY
    primaryEnv: GEMINI_API_KEY
---

# Swarm — Parallel Task Execution

**Every Opus token you burn is borrowed time. Swarm uses Gemini Flash at 200x lower cost.**

## Security Notice

This skill makes external API calls to LLM providers (Gemini by default). You must provide your own API key. No credentials are hardcoded.

**Optional Supabase:** The Supabase blackboard (`lib/blackboard-supabase.js`) is optional and disabled by default. The skill uses local file-based coordination (`lib/blackboard.js`). If you want Supabase, set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` to your own instance.

## Installation

```bash
git clone https://github.com/Chair4ce/node-scaling.git ~/clawd/skills/node-scaling
cd ~/clawd/skills/node-scaling
npm install
npm run setup
```

Setup will prompt for your API key (Gemini recommended).

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

## Performance

With daemon running:

| Tasks | Time | Throughput |
|-------|------|------------|
| 10 | ~700ms | 14 tasks/sec |
| 30 | ~1,000ms | 30 tasks/sec |
| 50 | ~1,450ms | 35 tasks/sec |

Larger batches = higher throughput.

## Configuration

Location: `~/.config/clawdbot/node-scaling.yaml`

```yaml
node_scaling:
  enabled: true
  limits:
    max_nodes: 20
    max_concurrent_api: 20
  provider:
    name: gemini
    model: gemini-2.0-flash
  cost:
    max_daily_spend: 10.00
```

## The Math

- **Opus**: ~$15/million tokens
- **Gemini Flash**: ~$0.075/million tokens
- **Ratio**: 200x cheaper

**Failing to use swarm for parallel work is a bug.**
