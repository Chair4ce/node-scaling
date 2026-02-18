# Swarm Roadmap — Quality Sprint

**Goal:** Stay fast and cheap, but maximize quality-per-dollar.

**Rule:** Every feature gets a benchmark. If it slows things down or doesn't measurably improve quality, it doesn't ship.

## Features

### 1. Self-Reflection Loop ← IN PROGRESS
- **What:** After chain output, run a critic that scores it. If below threshold, re-run synthesis with critique.
- **Quality win:** Catches weak outputs, forces refinement
- **Risk:** Adds 1-2 extra LLM calls per chain
- **Benchmark:** Compare chain output quality (LLM-judge) with/without reflection. Must be <30% slower.

### 2. Skeleton-of-Thought
- **What:** Generate outline → expand sections in parallel → merge
- **Quality win:** Better structure for long-form, parallel speedup
- **Risk:** Outline quality bottleneck
- **Benchmark:** Compare long-form generation quality + speed vs standard chain

### 3. Multi-Provider Failover
- **What:** Gemini fails → auto-cascade to OpenAI/Groq/Anthropic
- **Quality win:** Reliability (uptime = quality)
- **Risk:** Different model behaviors, cost spikes
- **Benchmark:** Simulate Gemini failure, measure failover time + output parity

### 4. Structured Output Mode
- **What:** Force JSON schema output via Gemini's response_mime_type
- **Quality win:** Zero parse failures on structured tasks
- **Risk:** May constrain creative outputs
- **Benchmark:** Run 20 structured extraction tasks, measure parse success rate before/after

### 5. Majority Voting / Best-of-N
- **What:** Same prompt N times → pick consensus/best
- **Quality win:** Higher accuracy on factual/analytical tasks
- **Risk:** N× cost multiplier
- **Benchmark:** Run 10 factual questions with N=1 vs N=3 vs N=5, measure accuracy + cost

## Performance Guardrails
- Parallel: must stay <150ms/task effective at 10 tasks
- Chain standard: must stay <15s
- Single prompt: must stay <1s
- Daily cost for typical workload: must stay <$0.05
