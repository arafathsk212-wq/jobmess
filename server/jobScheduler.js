const { searchJobs } = require('./jobScraper');
const repos = require('./repositories');

class JobScheduler {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.updateIntervalMinutes = 5; // Update every 5 minutes
  }

  start() {
    if (this.isRunning) {
      console.log('Job scheduler already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting job scheduler...');

    // Run immediately on startup
    this.runJobUpdate();

    // Schedule frequent updates
    this.scheduleUpdates();
  }

  scheduleUpdates() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    console.log(`Scheduling job updates every ${this.updateIntervalMinutes} minutes`);

    // Set up recurring updates
    this.intervalId = setInterval(() => {
      this.runJobUpdate();
    }, this.updateIntervalMinutes * 60 * 1000); // Convert minutes to milliseconds
  }

  async runJobUpdate() {
    console.log('Starting job update...');
    const now = new Date();
    const timestamp = now.toISOString();
    console.log(`Updating jobs at: ${timestamp}`);

    try {
      // Rotate through different job roles each update to avoid rate limiting
      const jobRoleSets = [
        ['Java Developer', '.NET Developer', 'DevOps Engineer'],
        ['Data Engineer', 'Cloud Engineer', 'QA Engineer'],
        ['Full Stack Developer', 'Backend Developer', 'Frontend Developer'],
        ['Software Engineer', 'React Developer', 'Python Developer'],
        ['AWS Engineer', 'Azure Engineer', 'GCP Engineer']
      ];

      // Use current minute to determine which set to search
      const setIndex = Math.floor(now.getMinutes() / 5) % jobRoleSets.length;
      const jobRoles = jobRoleSets[setIndex];

      let totalJobsSaved = 0;
      let totalJobsFound = 0;

      for (const jobRole of jobRoles) {
        console.log(`Searching for jobs: ${jobRole}`);
        try {
          const jobs = await searchJobs(jobRole);
          console.log(`Found ${jobs.length} jobs for ${jobRole}`);
          totalJobsFound += jobs.length;

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

      console.log(`Job update completed. Total jobs found: ${totalJobsFound}, Total jobs saved: ${totalJobsSaved}`);

      // Clean up old jobs older than 24 hours
      const deletedCount = repos.deleteOldJobs(24);
      console.log(`Cleaned up ${deletedCount} old jobs`);

    } catch (error) {
      console.error('Error in job update:', error);
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
      updateIntervalMinutes: this.updateIntervalMinutes,
      nextUpdate: this.isRunning ? 'Every 5 minutes' : 'Stopped'
    };
  }
}

module.exports = new JobScheduler();
