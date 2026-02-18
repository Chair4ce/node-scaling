---
name: swarm
description: "Parallel task execution using Gemini Flash workers. 200x cheaper than Opus. Includes chain pipelines for multi-stage refinement, auto-chain for dynamic pipeline construction, and built-in benchmarking."
homepage: https://github.com/Chair4ce/node-scaling
metadata: {"clawdbot":{"emoji":"🐝","requires":{"bins":["node"]}}}
---

# Swarm — Parallel Task Execution

**Cheap, fast, parallel LLM work using Gemini Flash. 200x cheaper than Opus.**

## What It Does

Swarm offloads parallelizable work to Gemini Flash workers instead of burning expensive model tokens. Three execution modes:

| Mode | What It Does | When to Use |
|------|-------------|-------------|
| **Parallel** | N prompts → N workers → N results | Independent tasks, batch processing |
| **Research** | Search → Fetch → Analyze (multi-phase) | Deep-dive on multiple subjects |
| **Chain** | Multi-stage refinement pipeline | Complex analysis needing multiple passes |

## Benchmark Results

We ran the same complex analysis task through single worker, parallel workers, and a 5-stage chain pipeline:

| Metric | Single | Parallel (3 workers) | Chain (5 stages) |
|--------|--------|---------------------|------------------|
| **Quality** | 4.4/5 | 4.3/5 | 4.4/5 |
| **Speed** | 35s | 9s | 71s |
| **Cost** | $0.0006 | $0.001 | $0.005 |
| **Output** | Good | Broad coverage | Self-critiqued, refined |

**Key findings:**
- **Parallel** is best for speed — 4x faster than single, same quality
- **Chain** matches single on quality but adds self-criticism and catches blind spots that single passes miss
- **All modes produce 80%+ of the quality of frontier models at 3% of the cost**
- Chain's value increases with task complexity — simple tasks don't benefit, complex strategy work does

**Bottom line:** Swarm isn't smarter than your main model. It's the bang-for-your-buck play. Use it for the 80% of work that doesn't need frontier reasoning.

## Quick Reference

```bash
swarm status                    # Check daemon
swarm start                     # Start daemon
swarm parallel "p1" "p2" "p3"   # Parallel execution
swarm research "s1" "s2" --topic "angle"  # Web research
swarm chain pipeline.json       # Run refinement chain
swarm capabilities              # Discover all available modes
swarm savings                   # Cost savings report
```

## Chain Pipelines (v1.3.0)

Chains run data through multiple stages, each with a different perspective. Stages can be:

| Stage Mode | Description |
|-----------|-------------|
| `parallel` | N inputs → N workers (same perspective) |
| `single` | Merged input → 1 worker |
| `fan-out` | 1 input → N workers (different perspectives) |
| `reduce` | N inputs → 1 synthesized output |

**Built-in perspectives:** extractor, filter, enricher, analyst, synthesizer, challenger, optimizer, strategist, researcher, critic

### Manual Chain (you define the pipeline)
```bash
swarm chain my-pipeline.json
```

### Auto Chain (describe what you want, pipeline builds itself)
```bash
curl -X POST http://localhost:9999/chain/auto \
  -d '{"task": "Compare and rank these options", "data": "...", "depth": "standard"}'
```

### Preview (dry run — see the plan without executing)
```bash
curl -X POST http://localhost:9999/chain/preview \
  -d '{"task": "research deep dive on competitors", "depth": "deep"}'
```

**Depth presets:** `quick` (2 stages), `standard` (4 stages), `deep` (5-6 stages), `exhaustive` (8 stages)

**Auto-detection:** The builder detects task type from natural language (comparative, research, adversarial, filter, multi-perspective, opportunity, summarize) and selects the optimal pipeline.

## Capabilities Discovery

Hit `/capabilities` to see all available execution modes, perspectives, and transforms:

```bash
swarm capabilities
# or
curl http://localhost:9999/capabilities
```

This is how the orchestrating LLM knows what tools are available before deciding execution strategy.

## Web Search

Workers can search the live web via Google Search grounding (Gemini only, no extra cost).

```bash
curl -X POST http://localhost:9999/research \
  -d '{"subjects": ["Company1", "Company2"], "topic": "pricing 2026"}'
```

## JavaScript API

```javascript
const { parallel, research, chain } = require('~/clawd/skills/node-scaling/lib/client');

const result = await parallel(['prompt1', 'prompt2', 'prompt3']);
const deep = await research(['Subject1', 'Subject2'], 'topic');
const refined = await chain({ name: 'My Pipeline', stages: [...] });
```

## Daemon Management

```bash
swarm start              # Start daemon (background)
swarm stop               # Stop daemon
swarm status             # Status, uptime, cost savings
swarm restart            # Restart daemon
swarm savings            # Monthly savings report
swarm logs [N]           # Last N lines of daemon log
```

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

## The Math

- **Opus**: ~$15/million tokens
- **Gemini Flash**: ~$0.075/million tokens
- **Ratio**: 200x cheaper

30 parallel tasks: ~$0.003 via Swarm vs ~$0.50 via Opus. Same results.
