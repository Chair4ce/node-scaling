# 🐝 Swarm - Parallel Task Execution for Clawdbot

[![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)](./CHANGELOG.md)
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
│Workers│        │Workers│        │Workers│
│(Flash)│        │(Flash)│        │(Flash)│
└───────┘        └───────┘        └───────┘
```

### Example Speedups

| Task | Sequential | Parallel | Speedup |
|------|------------|----------|---------|
| 5 web searches | ~6s | ~1.6s | **3.8x** |
| 10 summaries | ~8s | ~1s | **8x** |
| Research 5 companies | ~18s | ~6s | **3x** |

## Quick Start

### Installation

```bash
cd ~/clawd/skills
git clone https://github.com/Chair4ce/node-scaling.git
cd node-scaling
npm install
npm run setup
```

Setup will:
1. Configure your LLM provider (Gemini recommended)
2. Run diagnostics to verify everything works
3. Generate optimal settings for your machine

### Verify Installation

```bash
npm run diagnose
```

## Usage

Ask Clawdbot:

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
    max_nodes: 10              # Adjust based on your system
    max_concurrent_api: 5
    
  provider:
    name: gemini
    model: gemini-2.0-flash
    api_key_env: GEMINI_API_KEY
```

## Commands

```bash
npm run setup          # Interactive setup + tests
npm run diagnose       # Health check
npm run diagnose:json  # Machine-readable diagnostics
npm test               # Run all tests
```

## Daemon Mode (Fastest)

For instant response times, run the Swarm daemon:

```bash
# Start daemon (keeps workers warm)
swarm-daemon start

# Check status
swarm-daemon status

# Make requests (instant TTFT)
swarm research OpenAI Anthropic Mistral --topic "AI 2024"
```

**Performance with daemon:**
- Time to first token: <10ms
- Workers pre-warmed and ready
- API connections pooled

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
| Tests failing | Run `npm test` for details |

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
