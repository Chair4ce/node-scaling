# 🐝 Swarm - Parallel Task Execution for Clawdbot

[![Version](https://img.shields.io/badge/version-0.3.0-blue.svg)](./CHANGELOG.md)
[![Tests](https://img.shields.io/badge/tests-24%20passing-green.svg)](./test)

**Turn sequential tasks into parallel operations. Same cost, dramatically faster.**

## What is Swarm?

Swarm adds parallel processing capabilities to Clawdbot by spinning up lightweight LLM worker nodes. Instead of processing tasks sequentially, it distributes work across multiple workers running cheap models like Gemini Flash.

```
┌────────────────────────────────────────────────────┐
│              Coordinator (Claude)                  │
│         Orchestration • Memory • Synthesis         │
└─────────────────────┬──────────────────────────────┘
                      │ Task Distribution
    ┌─────────────────┼─────────────────┐
    │                 │                 │
┌───▼───┐        ┌───▼───┐        ┌───▼───┐
│Search │        │ Fetch │        │Analyze│
│Workers│        │(Flash)│        │Workers│
│(Flash)│        │       │        │(Flash)│
└───────┘        └───────┘        └───────┘
```

### Performance

| Tasks | Sequential | With Daemon | Speedup |
|-------|------------|-------------|---------|
| 10 | ~5s | 580ms | **~9x** |
| 30 | ~15s | 1,000ms | **~15x** |

**Throughput:** Up to 29 tasks/second with warm daemon.

## Quick Start

### Installation

```bash
cd ~/clawd/skills
git clone https://github.com/Chair4ce/node-scaling.git
cd node-scaling
npm install
npm run setup
```

### CLI

The unified `swarm` CLI handles both daemon management and task execution:

```bash
# Daemon management
swarm start              # Start daemon (background, warm workers)
swarm stop               # Stop daemon
swarm status             # Show status
swarm restart            # Restart daemon
swarm logs [N]           # Show last N lines of log

# Task execution (auto-uses daemon if running)
swarm parallel "prompt1" "prompt2" "prompt3"
swarm research OpenAI Anthropic --topic "AI safety"
swarm bench --tasks 30   # Benchmark

# Options
swarm start --port 9999 --workers 6
```

### Example Session

```bash
$ swarm start
🐝 Starting Swarm Daemon...
   Waiting for startup...
✅ Daemon ready on port 9999
   Workers: 6
   PID: 12345

$ swarm bench --tasks 10
⚡ Benchmark: 10 parallel tasks

🐝 Using daemon (port 9999)
   Processing.......... done!

⏱️  563ms | ✅ 10/10

📈 Total time: 582ms
   Per task:   58ms
   Throughput: 17.2 tasks/sec

$ swarm status
🐝 Swarm Daemon Status
─────────────────────────────────────────────
   Status:     ✅ Running
   Port:       9999
   Workers:    16
   Requests:   1
   Tasks:      10
   Avg time:   563ms
   Provider:   gemini
```

## Usage in Clawdbot

Ask Clawdbot to do parallel work:

```
"Research the top 5 AI companies and compare their products"
```

Swarm automatically kicks in for parallelizable tasks:

```
🐝 Swarm initializing...
   3 phase(s), up to 10 workers

   Phase 1: Search (5 tasks)
   ├─ Worker 1: OpenAI...
   ├─ Worker 2: Anthropic...
   ├─ Worker 3: Google...
   ├─ Worker 4: Meta...
   ├─ Worker 5: Microsoft...

🐝 Swarm complete ✓
   15/15 tasks (100% success)
   6.2s total
   ⚡ 4.1x faster than sequential
```

## JavaScript API

```javascript
const { parallel, research } = require('~/clawd/skills/node-scaling/lib');

// Run prompts in parallel
const result = await parallel([
  'What is OpenAI?',
  'What is Anthropic?',
  'What is Google DeepMind?'
]);
console.log(result.results); // Array of responses
console.log(result.stats);   // { totalDuration, successful, failed }

// Multi-phase research (search → fetch → analyze)
const result = await research(
  ['OpenAI', 'Anthropic', 'Mistral'],
  'AI products and pricing'
);
```

## Daemon HTTP API

When the daemon is running, you can also use HTTP:

```bash
# Health check
curl http://localhost:9999/health

# Status
curl http://localhost:9999/status

# Parallel execution
curl -X POST http://localhost:9999/parallel \
  -H "Content-Type: application/json" \
  -d '{"prompts": ["What is AI?", "What is ML?"]}'

# Research
curl -X POST http://localhost:9999/research \
  -H "Content-Type: application/json" \
  -d '{"subjects": ["OpenAI", "Anthropic"], "topic": "AI safety"}'
```

Responses are streamed as NDJSON for real-time progress.

## Supported Providers

| Provider | Model | Cost/1M tokens | Notes |
|----------|-------|----------------|-------|
| **Google Gemini** | gemini-2.0-flash | $0.075 | Recommended |
| **Groq** | llama-3.1-70b | Free tier | Fastest |
| **OpenAI** | gpt-4o-mini | $0.15 | Reliable |
| **Anthropic** | claude-3-haiku | $0.25 | Quality |

## Configuration

Config location: `~/.config/clawdbot/node-scaling.yaml`

```yaml
node_scaling:
  enabled: true
  
  limits:
    max_nodes: 16              # Adjust based on your system
    max_concurrent_api: 16
    
  provider:
    name: gemini
    model: gemini-2.0-flash
    api_key_env: GEMINI_API_KEY
    
  cost:
    max_daily_spend: 10.00     # Optional daily cap
```

## Troubleshooting

Run diagnostics first:
```bash
npm run diagnose
```

Common issues:

| Issue | Fix |
|-------|-----|
| No API key | Run `npm run setup` or set `GEMINI_API_KEY` |
| Rate limited | Reduce `max_concurrent_api` in config |
| Out of memory | Reduce `max_nodes` in config |
| Daemon won't start | Check `swarm logs` for errors |

## Requirements

- Node.js 18+
- Clawdbot installed
- API key from supported provider

## API Keys

**Google Gemini (Recommended)**
1. Go to https://aistudio.google.com/apikey
2. Create API key
3. Set: `export GEMINI_API_KEY=your-key`

**Groq (Free Tier)**
1. Go to https://console.groq.com/keys
2. Create API key
3. Set: `export GROQ_API_KEY=your-key`

## License

MIT

---

Part of the [Clawdbot](https://github.com/clawdbot/clawdbot) ecosystem
