# Node Scaling - Packaging Design

## Vision
A Clawdbot skill that any user can install to unlock parallel task execution using cheap LLM workers. Self-configuring, adaptive to resources, and easy to set up.

## Distribution Options

### Option 1: Clawdbot Skill (Recommended)
```bash
# User asks Clawdbot:
"Install the node-scaling skill from github.com/clawdbot/node-scaling"

# Or runs manually:
curl -fsSL https://raw.githubusercontent.com/clawdbot/node-scaling/main/install.sh | bash
```

### Option 2: npm package
```bash
npm install @clawdbot/node-scaling
```

## Key Design Principles

### 1. No Hardcoded Keys
- User provides their own API keys
- Stored in `~/.config/clawdbot/node-scaling.json`
- Clawdbot guides setup interactively

### 2. Adaptive Resource Management
- Auto-detect available resources (CPU, memory)
- Smart defaults based on system capabilities
- User can override with explicit limits

### 3. Multi-Provider Support
Support cheap LLM providers:
| Provider | Model | Cost (input/1M) | Speed |
|----------|-------|-----------------|-------|
| Google | Gemini 2.0 Flash | $0.075 | Fast |
| Anthropic | Claude Haiku | $0.25 | Fast |
| OpenAI | GPT-4o-mini | $0.15 | Fast |
| Groq | Llama 3.1 70B | Free tier | Very Fast |
| Together | Llama 3.1 | $0.18 | Fast |
| OpenRouter | Various | Varies | Varies |

### 4. Progressive Enhancement
- Works with 1 worker (minimal benefit, but functional)
- Scales up based on task complexity
- Falls back gracefully if resources constrained

## Configuration Schema

```yaml
# ~/.config/clawdbot/node-scaling.yaml
node_scaling:
  enabled: true
  
  # Resource limits
  limits:
    max_nodes: 10          # Maximum parallel workers (default: 10)
    max_concurrent_api: 5  # Max simultaneous API calls
    memory_per_node_mb: 50 # Estimated memory per worker
    
  # LLM Provider for workers
  provider:
    name: gemini           # gemini | openai | anthropic | groq | together | openrouter
    model: gemini-2.0-flash
    api_key_env: GEMINI_API_KEY  # Environment variable name (not the key itself!)
    # Or reference a file:
    # api_key_file: ~/.config/clawdbot/gemini-key.txt
    
  # Cost controls
  cost:
    max_daily_spend: 1.00  # USD, optional spending cap
    warn_at: 0.50          # Warn user at this spend level
    
  # Task routing
  routing:
    # Which tasks should use node scaling?
    auto_scale_threshold: 3  # Auto-parallelize if 3+ independent subtasks
    enabled_task_types:
      - research
      - batch_analysis
      - document_processing
      - web_search
```

## Installation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Node Scaling Setup                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Welcome! Let's configure parallel task execution.              │
│                                                                 │
│  This will allow Clawdbot to run multiple AI workers in        │
│  parallel for faster task completion.                           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Step 1: Choose your LLM provider for workers            │   │
│  │                                                         │   │
│  │  [1] Google Gemini Flash (Recommended - cheapest)       │   │
│  │  [2] OpenAI GPT-4o-mini                                 │   │
│  │  [3] Anthropic Claude Haiku                             │   │
│  │  [4] Groq (Free tier available)                         │   │
│  │  [5] Custom/OpenRouter                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Step 2: Enter your API key                              │   │
│  │                                                         │   │
│  │  Get a Gemini API key at:                               │   │
│  │  https://aistudio.google.com/apikey                     │   │
│  │                                                         │   │
│  │  API Key: ************************************          │   │
│  │                                                         │   │
│  │  ✓ Key validated successfully!                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Step 3: Resource limits                                 │   │
│  │                                                         │   │
│  │  Your system: 8 CPU cores, 16GB RAM                     │   │
│  │                                                         │   │
│  │  Recommended: max 10 parallel workers                   │   │
│  │  [Enter] to accept, or type a number: _                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ✅ Setup complete! Node scaling is now enabled.               │
│                                                                 │
│  Try it: "Research the top 5 AI companies"                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Repository Structure

```
node-scaling/
├── README.md                 # Overview, quick start
├── INSTALL.md               # Detailed installation guide
├── LICENSE                  # MIT
├── install.sh               # One-line installer
├── package.json
│
├── skill/
│   ├── SKILL.md             # Clawdbot skill definition
│   ├── setup.js             # Interactive setup wizard
│   ├── config-schema.json   # JSON schema for validation
│   └── examples/
│       └── research-task.md
│
├── lib/
│   ├── index.js             # Main entry point
│   ├── dispatcher.js        # Task orchestration
│   ├── worker-node.js       # Worker implementation
│   ├── providers/
│   │   ├── base.js          # Base provider class
│   │   ├── gemini.js
│   │   ├── openai.js
│   │   ├── anthropic.js
│   │   ├── groq.js
│   │   └── openrouter.js
│   └── tools/
│       ├── web-search.js
│       ├── web-fetch.js
│       └── analyze.js
│
├── bin/
│   └── node-scaling-setup   # CLI setup command
│
├── docs/
│   ├── configuration.md
│   ├── providers.md
│   ├── cost-optimization.md
│   └── troubleshooting.md
│
└── benchmark/
    ├── run-benchmark.js
    └── results/
```

## Install Script (install.sh)

```bash
#!/bin/bash
# Node Scaling Installer for Clawdbot

set -e

echo "🚀 Installing Node Scaling for Clawdbot..."

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Node.js required. Install from https://nodejs.org"; exit 1; }

# Determine install location
CLAWDBOT_HOME="${CLAWDBOT_HOME:-$HOME/clawd}"
SKILL_DIR="$CLAWDBOT_HOME/skills/node-scaling"

# Clone or update
if [ -d "$SKILL_DIR" ]; then
  echo "Updating existing installation..."
  cd "$SKILL_DIR" && git pull
else
  echo "Installing to $SKILL_DIR..."
  git clone https://github.com/clawdbot/node-scaling.git "$SKILL_DIR"
fi

# Install dependencies
cd "$SKILL_DIR"
npm install --production

# Run setup wizard
echo ""
echo "Running setup wizard..."
node bin/node-scaling-setup

echo ""
echo "✅ Node Scaling installed successfully!"
echo ""
echo "Try asking Clawdbot:"
echo '  "Research the top 5 programming languages and compare them"'
```

## How Clawdbot Uses It

When installed, Clawdbot's skill system loads the SKILL.md which teaches it:

1. **When to use node scaling** - Detects parallelizable tasks
2. **How to invoke** - Calls the dispatcher with task batches  
3. **How to configure** - Can adjust settings via config
4. **How to troubleshoot** - Common issues and fixes

Example SKILL.md snippet:
```markdown
# Node Scaling Skill

## When to Use
Activate node scaling when:
- User requests research on multiple subjects
- Batch processing tasks (multiple documents, URLs)
- Tasks with 3+ independent subtasks
- User explicitly asks for parallel/fast execution

## How to Use
1. Identify independent subtasks
2. Create task batch for dispatcher
3. Execute parallel via `node-scaling dispatch`
4. Aggregate and synthesize results

## Configuration
Config location: ~/.config/clawdbot/node-scaling.yaml
Modify with: `node-scaling config set <key> <value>`
```

## Next Steps

1. [ ] Create GitHub repo: `clawdbot/node-scaling`
2. [ ] Refactor code to remove hardcoded keys
3. [ ] Implement multi-provider support
4. [ ] Create setup wizard
5. [ ] Write SKILL.md for Clawdbot integration
6. [ ] Add cost tracking/limits
7. [ ] Create install.sh
8. [ ] Write documentation
9. [ ] Add benchmark suite
10. [ ] Test on fresh Clawdbot instance
