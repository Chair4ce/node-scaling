# 🚀 Node Scaling for Clawdbot

**Unlock parallel task execution with dynamic worker nodes.**

Turn a 3-minute research task into a 9-second operation. Same cost, dramatically faster.

[![Average Speedup](https://img.shields.io/badge/Avg%20Speedup-6.8x-brightgreen)](./BENCHMARK-REPORT.md)
[![Best Speedup](https://img.shields.io/badge/Best%20Speedup-18.2x-blue)](./BENCHMARK-REPORT.md)
[![Cost](https://img.shields.io/badge/Extra%20Cost-$0-green)](./BENCHMARK-REPORT.md)

## What is This?

Node Scaling adds parallel processing capabilities to Clawdbot by spinning up lightweight LLM worker nodes. Instead of processing tasks sequentially, it distributes work across multiple workers running cheap models like Gemini Flash.

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

## Quick Start

### One-Line Install

```bash
curl -fsSL https://raw.githubusercontent.com/clawdbot/node-scaling/main/install.sh | bash
```

### Or Ask Clawdbot

```
"Install the node-scaling skill"
```

### Manual Install

```bash
cd ~/clawd/skills
git clone https://github.com/clawdbot/node-scaling.git
cd node-scaling
npm install
node bin/setup.js
```

## Benchmark Results

| Task | Sequential | Parallel | Speedup |
|------|------------|----------|---------|
| 5 web searches | 6.2s | 1.6s | **3.8x** |
| 10 summaries | 7.4s | 0.9s | **8.0x** |
| 5 company research | 17.9s | 6.0s | **3.0x** |
| 10 tech analyses | 166s | 9.2s | **18.2x** 🏆 |
| 15-subject research | 49s | 6.4s | **7.7x** |

See [BENCHMARK-REPORT.md](./BENCHMARK-REPORT.md) for full results.

## Supported Providers

| Provider | Model | Cost/1M tokens | Notes |
|----------|-------|----------------|-------|
| **Google Gemini** | gemini-2.0-flash | $0.075 | Recommended - cheapest |
| **Groq** | llama-3.1-70b | Free tier! | Fastest inference |
| **OpenAI** | gpt-4o-mini | $0.15 | Good quality |
| **Anthropic** | claude-3-haiku | $0.25 | Reliable |

## Configuration

After setup, config is stored at `~/.config/clawdbot/node-scaling.yaml`:

```yaml
node_scaling:
  enabled: true
  
  limits:
    max_nodes: 10              # Adjust based on your system
    max_concurrent_api: 5
    
  provider:
    name: gemini               # Your chosen provider
    model: gemini-2.0-flash
    api_key_env: GEMINI_API_KEY
    
  cost:
    max_daily_spend: 5.00      # Optional spending cap
```

## How It Works

1. **Task Detection**: Clawdbot identifies parallelizable subtasks
2. **Distribution**: Dispatcher assigns tasks to available worker nodes
3. **Parallel Execution**: Workers process tasks simultaneously using cheap LLMs
4. **Aggregation**: Results collected and synthesized by the coordinator
5. **Node Recycling**: Workers are reused across phases

## Example Usage

Ask Clawdbot:

```
"Research the top 5 AI companies and compare their products"
```

Behind the scenes:
- 5 parallel web searches (1.6s instead of 6s)
- 5 parallel content fetches (0.5s instead of 2s)  
- 5 parallel analyses (3s instead of 15s)
- 1 synthesis step

**Total: 6 seconds instead of 24 seconds = 4x faster**

## Requirements

- Node.js 18+
- Clawdbot installed
- API key from supported provider

## API Key Setup

### Google Gemini (Recommended)
1. Go to https://aistudio.google.com/apikey
2. Create API key
3. Set environment variable: `export GEMINI_API_KEY=your-key`

### Groq (Free Tier)
1. Go to https://console.groq.com/keys
2. Create API key
3. Set: `export GROQ_API_KEY=your-key`

## Troubleshooting

**"No configuration found"**
```bash
cd ~/clawd/skills/node-scaling && node bin/setup.js
```

**"API rate limit"**
- Reduce `max_concurrent_api` in config
- Switch to a provider with higher limits

**"Out of memory"**
- Reduce `max_nodes` in config

## Contributing

PRs welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT - See [LICENSE](./LICENSE)

---

Built with 🤖 by [Clawdbot](https://github.com/clawdbot/clawdbot)
