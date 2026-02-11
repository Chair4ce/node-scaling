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

## 🔥 Monster Benchmark (6-Node Fleet)

Real-world benchmark across 6 distributed nodes (Mac mini + 5 Linux servers):

| Node | Tasks | Time | Throughput |
|------|-------|------|------------|
| Mac mini | 100 | 3.76s | 26.6/sec |
| openclaw-2 | 100 | 3.20s | 31.3/sec |
| openclaw-3 | 100 | 3.23s | 31.0/sec |
| openclaw-5 | 100 | 3.27s | 30.6/sec |
| openclaw-6 | 100 | 3.21s | 31.2/sec |
| openclaw-7 | 100 | 3.32s | 30.2/sec |

**Results:**
- **600 LLM tasks** completed in **3.8 seconds**
- **Combined throughput:** 181 tasks/sec
- **Estimated cost:** ~$0.045

**Comparison:**
- 600 tasks on Opus sequentially: ~10 minutes, ~$9
- 600 tasks on Swarm fleet: 3.8 seconds, $0.045
- **157x faster, 200x cheaper**

## When to Use

Trigger swarm when you see **ANY** of these:
- **3+ independent tasks** (research, summaries, comparisons)
- **"Compare X, Y, Z"** or **"Research the top N..."**
- **Multiple URLs** to fetch/analyze
- **Batch anything** (documents, entities, facts)
- **Multi-subject research** of any kind

## Quick Reference

```bash
# Check daemon status
swarm status

# Start daemon
swarm start

# Parallel prompts
swarm parallel "What is X?" "What is Y?" "What is Z?"

# Research multiple subjects
swarm research "OpenAI" "Anthropic" "Mistral" --topic "AI safety"

# Benchmark
swarm bench --tasks 30
```

## Single-Node Performance

With daemon running (3 workers):

| Tasks | Time | Throughput |
|-------|------|------------|
| 10 | ~700ms | 14 tasks/sec |
| 30 | ~1,000ms | 30 tasks/sec |
| 50 | ~1,450ms | 35 tasks/sec |

Larger batches = higher throughput (amortizes connection overhead).

## Multi-Node Scaling

Deploy swarm on multiple machines and run benchmarks in parallel:

```bash
# On each node
git clone https://github.com/Chair4ce/node-scaling.git
cd node-scaling && npm install && npm run setup
swarm start

# Run distributed benchmark
swarm bench --tasks 100
```

Each node adds ~30 tasks/sec to your combined throughput.

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
