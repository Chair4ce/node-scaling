/**
 * Swarm Metrics & Performance Tracking
 * Collects data over time for analysis and improvement
 */

const fs = require('fs');
const path = require('path');

const METRICS_DIR = path.join(process.env.HOME, '.config/clawdbot/swarm-metrics');
const METRICS_FILE = path.join(METRICS_DIR, 'performance.jsonl');
const DAILY_SUMMARY_FILE = path.join(METRICS_DIR, 'daily-summary.json');

class SwarmMetrics {
  constructor() {
    this.ensureMetricsDir();
    this.sessionStart = Date.now();
    this.sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }

  ensureMetricsDir() {
    if (!fs.existsSync(METRICS_DIR)) {
      fs.mkdirSync(METRICS_DIR, { recursive: true });
    }
  }

  /**
   * Log a Swarm execution
   */
  logExecution(data) {
    const entry = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      type: data.type || 'orchestration', // orchestration, parallel, code-gen
      
      // Task info
      taskCount: data.taskCount || 0,
      phases: data.phases || 1,
      nodeTypes: data.nodeTypes || [],
      
      // Performance
      durationMs: data.durationMs,
      successCount: data.successCount || 0,
      failureCount: data.failureCount || 0,
      
      // Speedup estimation
      estimatedSequentialMs: data.estimatedSequentialMs || null,
      speedup: data.speedup || null,
      
      // Resource usage
      nodesUsed: data.nodesUsed || 0,
      maxNodesHit: data.maxNodesHit || false,
      
      // Cost tracking
      estimatedCost: data.estimatedCost || null,
      tokensUsed: data.tokensUsed || null,
      
      // Context
      taskDescription: data.taskDescription || null,
      
      // Issues/observations
      warnings: data.warnings || [],
      errors: data.errors || [],
    };

    // Append to JSONL file
    fs.appendFileSync(METRICS_FILE, JSON.stringify(entry) + '\n');
    
    // Update daily summary
    this.updateDailySummary(entry);
    
    return entry;
  }

  /**
   * Log an edge case or issue
   */
  logEdgeCase(data) {
    const edgeCaseFile = path.join(METRICS_DIR, 'edge-cases.jsonl');
    const entry = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      type: data.type, // timeout, failure, unexpected, slow, etc.
      description: data.description,
      context: data.context || {},
      suggestedFix: data.suggestedFix || null,
    };
    
    fs.appendFileSync(edgeCaseFile, JSON.stringify(entry) + '\n');
    return entry;
  }

  /**
   * Update daily summary statistics
   */
  updateDailySummary(entry) {
    let summary = {};
    
    if (fs.existsSync(DAILY_SUMMARY_FILE)) {
      try {
        summary = JSON.parse(fs.readFileSync(DAILY_SUMMARY_FILE, 'utf8'));
      } catch (e) {
        summary = {};
      }
    }

    const today = new Date().toISOString().split('T')[0];
    
    if (!summary[today]) {
      summary[today] = {
        executions: 0,
        totalTasks: 0,
        totalDurationMs: 0,
        successCount: 0,
        failureCount: 0,
        avgSpeedup: 0,
        speedupSamples: [],
        nodeTypesUsed: {},
        edgeCases: 0,
      };
    }

    const day = summary[today];
    day.executions++;
    day.totalTasks += entry.taskCount;
    day.totalDurationMs += entry.durationMs;
    day.successCount += entry.successCount;
    day.failureCount += entry.failureCount;
    
    if (entry.speedup) {
      day.speedupSamples.push(entry.speedup);
      day.avgSpeedup = day.speedupSamples.reduce((a, b) => a + b, 0) / day.speedupSamples.length;
    }
    
    (entry.nodeTypes || []).forEach(type => {
      day.nodeTypesUsed[type] = (day.nodeTypesUsed[type] || 0) + 1;
    });

    fs.writeFileSync(DAILY_SUMMARY_FILE, JSON.stringify(summary, null, 2));
  }

  /**
   * Get performance report
   */
  getReport(days = 7) {
    if (!fs.existsSync(DAILY_SUMMARY_FILE)) {
      return { error: 'No metrics collected yet' };
    }

    const summary = JSON.parse(fs.readFileSync(DAILY_SUMMARY_FILE, 'utf8'));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    const relevantDays = Object.entries(summary)
      .filter(([date]) => new Date(date) >= cutoff)
      .sort(([a], [b]) => b.localeCompare(a));

    const totals = {
      days: relevantDays.length,
      executions: 0,
      tasks: 0,
      durationMs: 0,
      success: 0,
      failures: 0,
      avgSpeedup: 0,
    };

    const speedups = [];
    
    relevantDays.forEach(([, day]) => {
      totals.executions += day.executions;
      totals.tasks += day.totalTasks;
      totals.durationMs += day.totalDurationMs;
      totals.success += day.successCount;
      totals.failures += day.failureCount;
      speedups.push(...(day.speedupSamples || []));
    });

    if (speedups.length > 0) {
      totals.avgSpeedup = speedups.reduce((a, b) => a + b, 0) / speedups.length;
    }

    return {
      period: `Last ${days} days`,
      ...totals,
      successRate: totals.tasks > 0 ? ((totals.success / totals.tasks) * 100).toFixed(1) + '%' : 'N/A',
      avgSpeedup: totals.avgSpeedup.toFixed(2) + 'x',
      dailyBreakdown: Object.fromEntries(relevantDays),
    };
  }

  /**
   * Get edge cases for review
   */
  getEdgeCases(limit = 20) {
    const edgeCaseFile = path.join(METRICS_DIR, 'edge-cases.jsonl');
    
    if (!fs.existsSync(edgeCaseFile)) {
      return [];
    }

    const lines = fs.readFileSync(edgeCaseFile, 'utf8').trim().split('\n');
    return lines
      .slice(-limit)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
}

// Singleton instance
const metrics = new SwarmMetrics();

module.exports = { SwarmMetrics, metrics };
