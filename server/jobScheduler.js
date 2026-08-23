const { searchJobs } = require('./jobScraper');
const repos = require('./repositories');

class JobScheduler {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.dailyUpdateHour = 9; // 9 AM daily
  }

  start() {
    if (this.isRunning) {
      console.log('Job scheduler already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting job scheduler...');

    // Run immediately on startup
    this.runDailyJobUpdate();

    // Schedule daily updates
    this.scheduleNextUpdate();
  }

  scheduleNextUpdate() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    // Calculate time until next daily update
    const now = new Date();
    const nextUpdate = new Date();
    nextUpdate.setHours(this.dailyUpdateHour, 0, 0, 0);

    // If today's update time has passed, schedule for tomorrow
    if (now >= nextUpdate) {
      nextUpdate.setDate(nextUpdate.getDate() + 1);
    }

    const timeUntilUpdate = nextUpdate - now;
    console.log(`Next job update scheduled for: ${nextUpdate.toISOString()}`);

    // Set timeout for next update
    setTimeout(() => {
      this.runDailyJobUpdate();
      // Then set up recurring daily updates
      this.intervalId = setInterval(() => {
        this.runDailyJobUpdate();
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, timeUntilUpdate);
  }

  async runDailyJobUpdate() {
    console.log('Starting daily job update...');
    const today = new Date().toISOString().split('T')[0];
    console.log(`Updating jobs for date: ${today}`);

    try {
      // Common job roles to search for
      const jobRoles = [
        'Java Developer',
        '.NET Developer',
        'DevOps Engineer',
        'Data Engineer',
        'Cloud Engineer',
        'QA Engineer',
        'Full Stack Developer',
        'Backend Developer',
        'Frontend Developer',
        'Software Engineer'
      ];

      let totalJobsSaved = 0;

      for (const jobRole of jobRoles) {
        console.log(`Searching for jobs: ${jobRole}`);
        try {
          const jobs = await searchJobs(jobRole);
          console.log(`Found ${jobs.length} jobs for ${jobRole}`);

          for (const job of jobs) {
            const saved = repos.saveJob(job);
            if (saved) {
              totalJobsSaved++;
            }
          }
        } catch (error) {
          console.error(`Error searching for ${jobRole}:`, error.message);
        }
      }

      console.log(`Daily job update completed. Total jobs saved: ${totalJobsSaved}`);

      // Clean up old jobs (older than 30 days)
      const deletedCount = repos.deleteOldJobs(30);
      console.log(`Cleaned up ${deletedCount} old jobs`);

    } catch (error) {
      console.error('Error in daily job update:', error);
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('Job scheduler stopped');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      dailyUpdateHour: this.dailyUpdateHour
    };
  }
}

module.exports = new JobScheduler();
