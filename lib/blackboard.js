/**
 * Swarm Blackboard - Shared State for Worker Communication
 * 
 * Workers can read/write to the blackboard without API calls.
 * Enables worker-to-worker coordination.
 * 
 * Message types:
 *   FINDING   - Worker discovered something
 *   QUESTION  - Worker needs clarification
 *   CLAIM     - Worker claims a subtask
 *   SYNTHESIZE - Request synthesis of findings
 *   DONE      - Task complete
 */

const fs = require('fs');
const path = require('path');

class Blackboard {
  constructor(taskId, options = {}) {
    this.taskId = taskId;
    this.stateDir = options.stateDir || '/tmp/swarm-blackboard';
    this.stateFile = path.join(this.stateDir, `${taskId}.json`);
    this.state = {
      taskId,
      created: Date.now(),
      status: 'active',
      findings: [],
      questions: [],
      claims: {},
      messages: [],
      synthesis: null,
      metadata: {},
    };
    
    // Ensure directory exists
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }
    
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.stateFile)) {
        this.state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      }
    } catch (e) {
      // Start fresh
    }
  }

  save() {
    this.state.updated = Date.now();
    fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
  }

  // Worker posts a finding
  postFinding(workerId, finding, metadata = {}) {
    this.load(); // Refresh
    this.state.findings.push({
      workerId,
      finding,
      timestamp: Date.now(),
      ...metadata,
    });
    this.state.messages.push({
      type: 'FINDING',
      workerId,
      content: finding,
      timestamp: Date.now(),
    });
    this.save();
  }

  // Worker asks a question (for other workers or coordinator)
  postQuestion(workerId, question, metadata = {}) {
    this.load();
    this.state.questions.push({
      workerId,
      question,
      answered: false,
      timestamp: Date.now(),
      ...metadata,
    });
    this.state.messages.push({
      type: 'QUESTION',
      workerId,
      content: question,
      timestamp: Date.now(),
    });
    this.save();
  }

  // Worker claims a subtask
  claim(workerId, subtask) {
    this.load();
    if (!this.state.claims[subtask]) {
      this.state.claims[subtask] = {
        workerId,
        claimedAt: Date.now(),
        status: 'in_progress',
      };
      this.state.messages.push({
        type: 'CLAIM',
        workerId,
        content: subtask,
        timestamp: Date.now(),
      });
      this.save();
      return true;
    }
    return false; // Already claimed
  }

  // Complete a claimed subtask
  complete(workerId, subtask, result) {
    this.load();
    if (this.state.claims[subtask]?.workerId === workerId) {
      this.state.claims[subtask].status = 'complete';
      this.state.claims[subtask].result = result;
      this.state.claims[subtask].completedAt = Date.now();
      this.save();
      return true;
    }
    return false;
  }

  // Post synthesis (usually by coordinator)
  postSynthesis(synthesis) {
    this.load();
    this.state.synthesis = {
      content: synthesis,
      timestamp: Date.now(),
    };
    this.state.messages.push({
      type: 'SYNTHESIZE',
      content: synthesis,
      timestamp: Date.now(),
    });
    this.save();
  }

  // Mark task done
  markDone(finalResult) {
    this.load();
    this.state.status = 'done';
    this.state.finalResult = finalResult;
    this.state.completedAt = Date.now();
    this.state.messages.push({
      type: 'DONE',
      content: finalResult,
      timestamp: Date.now(),
    });
    this.save();
  }

  // Get current state for worker context
  getContext() {
    this.load();
    return {
      findings: this.state.findings.map(f => f.finding),
      openQuestions: this.state.questions.filter(q => !q.answered).map(q => q.question),
      claimedTasks: Object.keys(this.state.claims),
      availableTasks: [], // Would be populated by coordinator
      status: this.state.status,
      messageCount: this.state.messages.length,
    };
  }

  // Get full state
  getState() {
    this.load();
    return this.state;
  }

  // Clean up old blackboards
  static cleanup(maxAgeMs = 3600000) { // 1 hour default
    const stateDir = '/tmp/swarm-blackboard';
    if (!fs.existsSync(stateDir)) return;
    
    const now = Date.now();
    const files = fs.readdirSync(stateDir);
    let cleaned = 0;
    
    for (const file of files) {
      const filePath = path.join(stateDir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    }
    
    return cleaned;
  }
}

module.exports = { Blackboard };
