/**
 * Persistent Worker
 * 
 * Always-on worker with persistent Supabase Realtime subscription.
 * Stays subscribed, reacts instantly to new jobs.
 */

const { createClient } = require('@supabase/supabase-js');
const { globalLimiter } = require('./rate-limiter');
const config = require('../config');
const { createProvider } = require('./providers');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

class PersistentWorker {
  constructor(id, options = {}) {
    this.id = id;
    this.role = options.role || 'flex';  // 'search', 'analyze', 'summarize', 'flex'
    this.status = 'initializing';
    this.jobsCompleted = 0;
    this.jobsFailed = 0;
    this.currentJob = null;
    this.startTime = Date.now();
    
    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    // Create provider from config
    const providerConfig = config.provider;
    this.provider = createProvider({
      provider: providerConfig.name,
      model: providerConfig.model,
      apiKey: providerConfig.apiKey,
    });
    this.subscription = null;
    this.onStatusChange = options.onStatusChange || (() => {});
  }

  async start() {
    console.log(`   🔧 Worker ${this.id} (${this.role}) starting...`);
    
    // Subscribe to job queue - STAYS SUBSCRIBED FOREVER
    await this.subscribeToJobs();
    
    this.status = 'idle';
    this.onStatusChange(this.id, 'idle');
    console.log(`   ✅ Worker ${this.id} ready and listening`);
    
    return this;
  }

  async subscribeToJobs() {
    return new Promise((resolve, reject) => {
      const filter = this.role === 'flex' 
        ? undefined  // Flex workers see all jobs
        : `job_type=eq.${this.role}`;  // Specialists only see their type
      
      this.subscription = this.supabase
        .channel(`worker:${this.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'swarm_jobs',
          filter
        }, async (payload) => {
          // New job available!
          if (this.status === 'idle' && payload.new.status === 'pending') {
            await this.tryClaimJob(payload.new);
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            resolve();
          } else if (status === 'CHANNEL_ERROR') {
            reject(new Error('Subscription failed'));
          }
        });
    });
  }

  async tryClaimJob(job) {
    // Atomic claim - only one worker gets it
    const { data, error } = await this.supabase
      .from('swarm_jobs')
      .update({ 
        status: 'claimed', 
        claimed_by: this.id,
        claimed_at: new Date().toISOString()
      })
      .eq('id', job.id)
      .eq('status', 'pending')  // Only claim if still pending
      .select()
      .single();
    
    if (error || !data) {
      // Another worker claimed it first
      return;
    }
    
    // We got the job!
    console.log(`   ⚡ Worker ${this.id} claimed job ${job.id.slice(0, 8)} (${job.job_type})`);
    await this.executeJob(data);
  }

  async executeJob(job) {
    this.status = 'busy';
    this.currentJob = job;
    this.onStatusChange(this.id, 'busy', job);
    
    try {
      // Update status to running
      await this.supabase
        .from('swarm_jobs')
        .update({ status: 'running' })
        .eq('id', job.id);
      
      // Execute based on job type
      const result = await this.execute(job);
      
      // Mark done
      await this.supabase
        .from('swarm_jobs')
        .update({ 
          status: 'done',
          result: typeof result === 'string' ? result : JSON.stringify(result),
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id);
      
      this.jobsCompleted++;
      console.log(`   ✅ Worker ${this.id} completed job ${job.id.slice(0, 8)}`);
      
    } catch (err) {
      // Mark failed
      await this.supabase
        .from('swarm_jobs')
        .update({ 
          status: 'failed',
          error: err.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id);
      
      this.jobsFailed++;
      console.log(`   ❌ Worker ${this.id} failed job ${job.id.slice(0, 8)}: ${err.message}`);
    }
    
    this.status = 'idle';
    this.currentJob = null;
    this.onStatusChange(this.id, 'idle');
    
    // Check for pending jobs we might have missed while busy
    await this.checkForPendingJobs();
  }

  async execute(job) {
    await globalLimiter.acquire();
    
    const prompt = job.input;
    const options = job.options || {};
    
    return await this.provider.complete(prompt, options);
  }

  async checkForPendingJobs() {
    // Look for unclaimed jobs
    const filter = this.role === 'flex' 
      ? {} 
      : { job_type: this.role };
    
    const { data } = await this.supabase
      .from('swarm_jobs')
      .select('*')
      .eq('status', 'pending')
      .match(filter)
      .order('created_at', { ascending: true })
      .limit(1);
    
    if (data && data.length > 0) {
      await this.tryClaimJob(data[0]);
    }
  }

  getStats() {
    return {
      id: this.id,
      role: this.role,
      status: this.status,
      jobsCompleted: this.jobsCompleted,
      jobsFailed: this.jobsFailed,
      uptime: Date.now() - this.startTime,
      currentJob: this.currentJob?.id?.slice(0, 8) || null,
    };
  }

  async stop() {
    if (this.subscription) {
      await this.supabase.removeChannel(this.subscription);
    }
    this.status = 'stopped';
    console.log(`   🛑 Worker ${this.id} stopped`);
  }
}

module.exports = { PersistentWorker };
