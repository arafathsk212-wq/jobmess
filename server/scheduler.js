const { listActiveCampaigns } = require('./repositories');

class CampaignScheduler {
  constructor({ runCampaign, onBroadcast = null }) {
    this.runCampaign = runCampaign;
    this.onBroadcast = onBroadcast;
    this.jobs = new Map();
    this.running = new Set();
    this.shuttingDown = false;
  }

  schedule(campaign) {
    if (!campaign || !campaign.id) return;
    if (this.shuttingDown) return;

    if (campaign.status === 'completed' || campaign.status === 'cancelled' || campaign.status === 'failed') {
      this.cancel(campaign.id);
      return;
    }

    this.cancel(campaign.id);

    if (campaign.status === 'sending') {
      this.runCampaign(campaign.id).catch((error) => {
        console.error(`Scheduler restarted campaign ${campaign.id} failed:`, error.message);
      });
      return;
    }

    const scheduledAt = campaign.scheduledFor ? new Date(campaign.scheduledFor).getTime() : Date.now();
    const delay = Math.max(0, scheduledAt - Date.now());
    const timeoutId = setTimeout(async () => {
      this.jobs.delete(campaign.id);
      if (this.running.has(campaign.id)) return;
      this.running.add(campaign.id);
      try {
        await this.runCampaign(campaign.id);
      } catch (error) {
        console.error(`Campaign ${campaign.id} runner failed:`, error.message);
      } finally {
        this.running.delete(campaign.id);
      }
    }, delay);

    this.jobs.set(campaign.id, timeoutId);
  }

  cancel(campaignId) {
    const timeoutId = this.jobs.get(campaignId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.jobs.delete(campaignId);
    }
  }

  async sync() {
    const active = await listActiveCampaigns();
    const activeIds = new Set(active.map((c) => c.id));

    active.forEach((campaign) => this.schedule(campaign));

    Array.from(this.jobs.keys()).forEach((jobId) => {
      if (!activeIds.has(jobId)) this.cancel(jobId);
    });
  }

  isRunning(campaignId) {
    return this.running.has(campaignId);
  }

  shutdown() {
    this.shuttingDown = true;
    Array.from(this.jobs.keys()).forEach((id) => this.cancel(id));
  }
}

module.exports = CampaignScheduler;
