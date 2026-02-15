/**
 * Supabase-backed Swarm Blackboard
 * 
 * Workers communicate via Supabase table with Realtime subscriptions.
 * Much faster than file-based, supports real-time notifications.
 */

const { createClient } = require('@supabase/supabase-js');

// Default to local Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54421';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  null; // No default - user must provide their own key if using Supabase blackboard

class SupabaseBlackboard {
  constructor(taskId, options = {}) {
    this.taskId = taskId;
    this.supabase = createClient(
      options.supabaseUrl || SUPABASE_URL,
      options.supabaseKey || SUPABASE_KEY
    );
    this.subscription = null;
    this.listeners = new Map();
    this.cache = {
      findings: [],
      questions: [],
      claims: [],
      messages: [],
    };
  }

  /**
   * Subscribe to real-time updates for this task
   */
  subscribe(callback) {
    this.subscription = this.supabase
      .channel(`swarm:${this.taskId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'swarm_blackboard',
        filter: `task_id=eq.${this.taskId}`
      }, (payload) => {
        // Update cache
        this.cache.messages.push(payload.new);
        if (payload.new.msg_type === 'FINDING') {
          this.cache.findings.push(payload.new.content);
        } else if (payload.new.msg_type === 'QUESTION') {
          this.cache.questions.push(payload.new.content);
        } else if (payload.new.msg_type === 'CLAIM') {
          this.cache.claims.push(payload.new.content);
        }
        
        // Notify listeners
        if (callback) callback(payload.new);
        this.listeners.forEach(cb => cb(payload.new));
      })
      .subscribe();
    
    return this;
  }

  /**
   * Add a listener for real-time updates
   */
  onMessage(id, callback) {
    this.listeners.set(id, callback);
    return () => this.listeners.delete(id);
  }

  /**
   * Unsubscribe from real-time updates
   */
  async unsubscribe() {
    if (this.subscription) {
      await this.supabase.removeChannel(this.subscription);
      this.subscription = null;
    }
  }

  /**
   * Post a finding
   */
  async postFinding(workerId, finding, metadata = {}) {
    const { error } = await this.supabase.from('swarm_blackboard').insert({
      task_id: this.taskId,
      worker_id: workerId,
      msg_type: 'FINDING',
      content: finding,
      metadata,
    });
    
    if (error) throw new Error(`Failed to post finding: ${error.message}`);
    return true;
  }

  /**
   * Post a question
   */
  async postQuestion(workerId, question, metadata = {}) {
    const { error } = await this.supabase.from('swarm_blackboard').insert({
      task_id: this.taskId,
      worker_id: workerId,
      msg_type: 'QUESTION',
      content: question,
      metadata,
    });
    
    if (error) throw new Error(`Failed to post question: ${error.message}`);
    return true;
  }

  /**
   * Claim a subtask
   */
  async claim(workerId, subtask) {
    // Check if already claimed
    const { data: existing } = await this.supabase
      .from('swarm_blackboard')
      .select('id')
      .eq('task_id', this.taskId)
      .eq('msg_type', 'CLAIM')
      .eq('content', subtask)
      .limit(1);
    
    if (existing && existing.length > 0) {
      return false; // Already claimed
    }
    
    const { error } = await this.supabase.from('swarm_blackboard').insert({
      task_id: this.taskId,
      worker_id: workerId,
      msg_type: 'CLAIM',
      content: subtask,
      metadata: { claimedAt: Date.now() },
    });
    
    if (error) throw new Error(`Failed to claim: ${error.message}`);
    return true;
  }

  /**
   * Post synthesis
   */
  async postSynthesis(synthesis) {
    const { error } = await this.supabase.from('swarm_blackboard').insert({
      task_id: this.taskId,
      worker_id: 'coordinator',
      msg_type: 'SYNTHESIZE',
      content: synthesis,
    });
    
    if (error) throw new Error(`Failed to post synthesis: ${error.message}`);
    return true;
  }

  /**
   * Mark task done
   */
  async markDone(finalResult) {
    const { error } = await this.supabase.from('swarm_blackboard').insert({
      task_id: this.taskId,
      worker_id: 'coordinator',
      msg_type: 'DONE',
      content: finalResult,
    });
    
    if (error) throw new Error(`Failed to mark done: ${error.message}`);
    return true;
  }

  /**
   * Get current context (all messages for this task)
   */
  async getContext() {
    const { data, error } = await this.supabase
      .from('swarm_blackboard')
      .select('*')
      .eq('task_id', this.taskId)
      .order('created_at', { ascending: true });
    
    if (error) throw new Error(`Failed to get context: ${error.message}`);
    
    const findings = data.filter(m => m.msg_type === 'FINDING').map(m => m.content);
    const questions = data.filter(m => m.msg_type === 'QUESTION').map(m => m.content);
    const claims = data.filter(m => m.msg_type === 'CLAIM').map(m => m.content);
    const isDone = data.some(m => m.msg_type === 'DONE');
    
    return {
      findings,
      openQuestions: questions, // Could filter answered ones with metadata
      claimedTasks: claims,
      status: isDone ? 'done' : 'active',
      messageCount: data.length,
    };
  }

  /**
   * Get full state
   */
  async getState() {
    const { data, error } = await this.supabase
      .from('swarm_blackboard')
      .select('*')
      .eq('task_id', this.taskId)
      .order('created_at', { ascending: true });
    
    if (error) throw new Error(`Failed to get state: ${error.message}`);
    
    return {
      taskId: this.taskId,
      messages: data,
      findings: data.filter(m => m.msg_type === 'FINDING'),
      questions: data.filter(m => m.msg_type === 'QUESTION'),
      claims: data.filter(m => m.msg_type === 'CLAIM'),
      synthesis: data.find(m => m.msg_type === 'SYNTHESIZE')?.content,
      status: data.some(m => m.msg_type === 'DONE') ? 'done' : 'active',
    };
  }

  /**
   * Cleanup old tasks
   */
  static async cleanup(maxAgeHours = 1) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('swarm_blackboard')
      .delete()
      .lt('created_at', cutoff)
      .select('id');
    
    if (error) throw new Error(`Cleanup failed: ${error.message}`);
    return data?.length || 0;
  }
}

module.exports = { SupabaseBlackboard };
