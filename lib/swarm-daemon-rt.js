/**
 * Swarm Daemon with Realtime
 * 
 * Manages a pool of persistent workers with always-on Supabase subscriptions.
 * Workers never tear down - they stay subscribed and react instantly.
 */

const { createClient } = require('@supabase/supabase-js');
const { PersistentWorker } = require('./persistent-worker');
const { globalLimiter } = require('./rate-limiter');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

class RealtimeSwarmDaemon {
  constructor(options = {}) {
    this.workers = new Map();
    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    this.startTime = null;
    this.jobsSubmitted = 0;
    
    // Worker configuration
    this.config = {
      // Specialists
      search: options.searchWorkers || 2,
      analyze: options.analyzeWorkers || 2,
      summarize: options.summarizeWorkers || 1,
      // Flex workers handle anything
      flex: options.flexWorkers || 3,
    };
  }

  async start() {
    console.log('🐝 Starting Realtime Swarm Daemon...\n');
    this.startTime = Date.now();
    
    // Spawn workers
    let workerId = 0;
    
    for (const [role, count] of Object.entries(this.config)) {
      for (let i = 0; i < count; i++) {
        workerId++;
        const id = `${role}-${workerId}`;
        const worker = new PersistentWorker(id, {
          role,
          onStatusChange: (id, status, job) => this.onWorkerStatusChange(id, status, job),
        });
        
        await worker.start();
        this.workers.set(id, worker);
      }
    }
    
    const totalWorkers = this.workers.size;
    console.log(`\n🚀 Swarm Daemon ready with ${totalWorkers} persistent workers`);
    console.log('   Workers stay subscribed - instant job reaction\n');
    
    this.printStatus();
    
    return this;
  }

  onWorkerStatusChange(workerId, status, job) {
    // Could emit events, update UI, etc.
  }

  /**
   * Submit a job to the swarm
   * Workers will compete to claim it via realtime
   */
  async submitJob(jobType, input, options = {}) {
    const taskId = options.taskId || `task-${Date.now()}`;
    
    const { data, error } = await this.supabase
      .from('swarm_jobs')
      .insert({
        task_id: taskId,
        job_type: jobType,
        input,
        options,
        status: 'pending',
      })
      .select()
      .single();
    
    if (error) throw new Error(`Failed to submit job: ${error.message}`);
    
    this.jobsSubmitted++;
    return data;
  }

  /**
   * Submit multiple jobs and wait for all results
   */
  async submitBatch(jobs, options = {}) {
    const taskId = options.taskId || `batch-${Date.now()}`;
    const timeout = options.timeout || 30000;
    
    // Submit all jobs
    const submittedJobs = [];
    for (const job of jobs) {
      const submitted = await this.submitJob(job.type || 'analyze', job.input, {
        ...job.options,
        taskId,
      });
      submittedJobs.push(submitted);
    }
    
    // Wait for completion
    const jobIds = submittedJobs.map(j => j.id);
    const results = await this.waitForJobs(jobIds, timeout);
    
    return {
      taskId,
      results,
      stats: {
        submitted: jobs.length,
        completed: results.filter(r => r.status === 'done').length,
        failed: results.filter(r => r.status === 'failed').length,
      },
    };
  }

  /**
   * Wait for specific jobs to complete
   */
  async waitForJobs(jobIds, timeout = 30000) {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      const { data } = await this.supabase
        .from('swarm_jobs')
        .select('*')
        .in('id', jobIds);
      
      const allDone = data?.every(j => j.status === 'done' || j.status === 'failed');
      
      if (allDone) {
        return data;
      }
      
      // Brief wait before checking again
      await new Promise(r => setTimeout(r, 100));
    }
    
    throw new Error('Timeout waiting for jobs');
  }

  /**
   * Quick parallel prompts - submit and wait
   */
  async parallel(prompts, options = {}) {
    const jobs = prompts.map(input => ({
      type: 'analyze',
      input,
    }));
    
    const start = Date.now();
    const result = await this.submitBatch(jobs, options);
    const duration = Date.now() - start;
    
    return {
      results: result.results.map(r => r.status === 'done' ? r.result : null),
      stats: {
        ...result.stats,
        duration,
        jobsPerSecond: (jobs.length / (duration / 1000)).toFixed(2),
      },
    };
  }

  printStatus() {
    console.log('📊 Worker Status:');
    console.log('┌────────────────┬────────┬──────────┐');
    console.log('│ Worker         │ Role   │ Status   │');
    console.log('├────────────────┼────────┼──────────┤');
    
    for (const [id, worker] of this.workers) {
      const stats = worker.getStats();
      const status = stats.status === 'idle' ? '🟢 idle' : '🔴 busy';
      console.log(`│ ${id.padEnd(14)} │ ${stats.role.padEnd(6)} │ ${status.padEnd(8)} │`);
    }
    
    console.log('└────────────────┴────────┴──────────┘');
  }

  getStats() {
    const workerStats = Array.from(this.workers.values()).map(w => w.getStats());
    const idle = workerStats.filter(w => w.status === 'idle').length;
    const busy = workerStats.filter(w => w.status === 'busy').length;
    
    return {
      uptime: Date.now() - this.startTime,
      totalWorkers: this.workers.size,
      idle,
      busy,
      jobsSubmitted: this.jobsSubmitted,
      jobsCompleted: workerStats.reduce((sum, w) => sum + w.jobsCompleted, 0),
      jobsFailed: workerStats.reduce((sum, w) => sum + w.jobsFailed, 0),
      rateLimiter: globalLimiter.getStats(),
      workers: workerStats,
    };
  }

  async stop() {
    console.log('\n🛑 Stopping Swarm Daemon...');
    
    for (const worker of this.workers.values()) {
      await worker.stop();
    }
    
    console.log('   All workers stopped');
  }
}

module.exports = { RealtimeSwarmDaemon };
