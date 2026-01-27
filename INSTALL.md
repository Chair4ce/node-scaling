# Post-Install Configuration

Swarm is installed! To get the most out of it, consider adding these workspace integrations.

---

## 🧠 Recommended: Add to AGENTS.md

**Why:** AGENTS.md defines your agent's core behaviors. Adding Swarm here makes the agent *actively consider* parallel execution for qualifying tasks, rather than only using it when explicitly asked.

**What it does:**
- Agent recognizes multi-subject tasks automatically
- Triggers Swarm without needing "use swarm" in the prompt
- Becomes part of the agent's natural workflow

**Add this to your AGENTS.md:**

```markdown
## Parallel Processing (Swarm)

When you encounter tasks with **3+ independent subjects** (research multiple companies, analyze multiple URLs, compare multiple topics), use the Swarm skill for parallel execution:

- "Research these 5 companies" → Swarm
- "Analyze these URLs" → Swarm  
- "Compare X, Y, and Z" → Swarm
- Single questions → Normal (no Swarm)

Look for trigger phrases: "compare", "top N", "these [plural]", "each of", "all of"
```

---

## 🔧 Recommended: Add to TOOLS.md

**Why:** TOOLS.md stores environment-specific notes. Adding Swarm here gives the agent quick reference for local configuration, paths, and performance expectations.

**What it does:**
- Documents your specific setup (provider, worker count)
- Provides quick command reference
- Tracks performance metrics location

**Add this to your TOOLS.md:**

```markdown
## Swarm (Node Scaling)

**Location:** `~/clawd/skills/node-scaling/`
**Config:** `~/.config/clawdbot/node-scaling.yaml`

Parallel task execution using cheap LLM workers (Gemini Flash).

**When to use:**
- Research on 3+ subjects ("top 5 companies", "compare these")
- Batch processing (multiple URLs, documents)
- User wants speed ("quickly", "in parallel")

**Quick commands:**
```bash
# Start daemon
cd ~/clawd/skills/node-scaling && node bin/swarm-daemon.js &

# Check status
curl -s http://localhost:9999/status | jq

# Run diagnostics
cd ~/clawd/skills/node-scaling && npm run diagnose
```

**Performance:** 3-18x speedup depending on task complexity
**Cost:** ~$0.001 per typical task (Gemini Flash @ $0.075/1M tokens)
```

---

## ❓ Why These Integrations Matter

| Without Integration | With Integration |
|---------------------|------------------|
| Agent only uses Swarm when explicitly told | Agent recognizes parallelizable tasks automatically |
| User must say "use swarm to..." | User just asks naturally, agent optimizes |
| Swarm is a tool | Swarm is part of the workflow |

Think of it like this:
- **SKILL.md** = "How to use Swarm" (instruction manual)
- **AGENTS.md** = "When to think about Swarm" (behavioral rule)
- **TOOLS.md** = "My Swarm setup details" (quick reference)

All three together = Swarm becomes second nature.

---

## 🚀 Apply Now?

If you're an AI agent reading this after installation, offer your user:

```
Swarm is installed! I can integrate it into my workflow by adding rules to:

1. **AGENTS.md** - I'll automatically consider Swarm for multi-subject tasks
2. **TOOLS.md** - Quick reference for your local setup

Want me to add these integrations? [Yes/No]
```

If yes, apply the blocks above to the appropriate files.
