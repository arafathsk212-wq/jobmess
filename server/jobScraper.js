const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');

puppeteer.use(StealthPlugin());

const jobPortals = [
  { name: 'LinkedIn', url: 'https://www.linkedin.com/jobs/search/', type: 'linkedin' },
  { name: 'Indeed', url: 'https://www.indeed.com/jobs', type: 'indeed' },
  { name: 'Dice', url: 'https://www.dice.com/jobs', type: 'dice' },
  { name: 'Monster', url: 'https://www.monster.com/jobs', type: 'monster' },
];

const c2cKeywords = ['c2c', 'corp to corp', 'corptocorp', '1099', 'independent contractor'];
const visaKeywords = ['green card', 'gc', 'usc', 'us citizen', 'h1b', 'e-ad', 'ead', 'opt', 'cpt'];
const visaRequirements = ['green card', 'gc', 'usc', 'us citizen'];

function extractEmail(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex);
  return matches ? matches[0] : null;
}

function extractPhone(text) {
  const phoneRegex = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const matches = text.match(phoneRegex);
  return matches ? matches[0] : null;
}

function isC2C(text) {
  const lowerText = text.toLowerCase();
  return c2cKeywords.some(keyword => lowerText.includes(keyword));
}

function hasVisaRequirement(text) {
  const lowerText = text.toLowerCase();
  return visaRequirements.some(keyword => lowerText.includes(keyword));
}

function getVisaStatus(text) {
  const lowerText = text.toLowerCase();
  if (lowerText.includes('green card') || lowerText.includes('gc')) return 'Green Card';
  if (lowerText.includes('usc') || lowerText.includes('us citizen')) return 'US Citizen';
  if (lowerText.includes('h1b')) return 'H-1B';
  if (lowerText.includes('e-ad') || lowerText.includes('ead')) return 'EAD';
  if (lowerText.includes('opt') || lowerText.includes('cpt')) return 'CPT/OPT';
  return 'Not Specified';
}

async function scrapeLinkedIn(jobRole) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(jobRole)}&f_TPR=r86400&f_JT=F`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    await page.waitForTimeout(3000);

    const content = await page.content();
    const $ = cheerio.load(content);

    const jobs = [];
    $('.job-card-container').each((index, element) => {
      const $el = $(element);
      const title = $el.find('.job-title').text().trim();
      const company = $el.find('.company-name').text().trim();
      const location = $el.find('.job-location').text().trim();
      const description = $el.find('.job-description').text().trim();
      
      if (title && company) {
        const email = extractEmail(description);
        const phone = extractPhone(description);
        const isC2CJob = isC2C(description);
        const visaStatus = getVisaStatus(description);
        
        if (isC2CJob || hasVisaRequirement(description)) {
          jobs.push({
            title,
            company,
            location,
            visaStatus,
            employmentType: isC2CJob ? 'C2C' : 'Not Specified',
            postedDate: new Date().toISOString().split('T')[0],
            source: 'LinkedIn',
            email,
            phone,
            description: description.substring(0, 500)
          });
        }
      }
    });

    return jobs;
  } catch (error) {
    console.error('LinkedIn scraping error:', error.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function scrapeIndeed(jobRole) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    const searchUrl = `https://www.indeed.com/jobs?q=${encodeURIComponent(jobRole + ' c2c')}&fromage=1`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    await page.waitForTimeout(3000);

    const content = await page.content();
    const $ = cheerio.load(content);

    const jobs = [];
    $('.jobsearch-SerpJobCard').each((index, element) => {
      const $el = $(element);
      const title = $el.find('.jobTitle').text().trim();
      const company = $el.find('.companyName').text().trim();
      const location = $el.find('.companyLocation').text().trim();
      const description = $el.find('.job-snippet').text().trim();
      
      if (title && company) {
        const email = extractEmail(description);
        const phone = extractPhone(description);
        const isC2CJob = isC2C(description);
        const visaStatus = getVisaStatus(description);
        
        if (isC2CJob || hasVisaRequirement(description)) {
          jobs.push({
            title,
            company,
            location,
            visaStatus,
            employmentType: isC2CJob ? 'C2C' : 'Not Specified',
            postedDate: new Date().toISOString().split('T')[0],
            source: 'Indeed',
            email,
            phone,
            description: description.substring(0, 500)
          });
        }
      }
    });

    return jobs;
  } catch (error) {
    console.error('Indeed scraping error:', error.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function scrapeDice(jobRole) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    const searchUrl = `https://www.dice.com/jobs?q=${encodeURIComponent(jobRole)}&sort=date&limit=20`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    await page.waitForTimeout(3000);

    const content = await page.content();
    const $ = cheerio.load(content);

    const jobs = [];
    $('.search-result').each((index, element) => {
      const $el = $(element);
      const title = $el.find('.jobTitle').text().trim();
      const company = $el.find('.company').text().trim();
      const location = $el.find('.location').text().trim();
      const description = $el.find('.shortdesc').text().trim();
      
      if (title && company) {
        const email = extractEmail(description);
        const phone = extractPhone(description);
        const isC2CJob = isC2C(description);
        const visaStatus = getVisaStatus(description);
        
        if (isC2CJob || hasVisaRequirement(description)) {
          jobs.push({
            title,
            company,
            location,
            visaStatus,
            employmentType: isC2CJob ? 'C2C' : 'Not Specified',
            postedDate: new Date().toISOString().split('T')[0],
            source: 'Dice',
            email,
            phone,
            description: description.substring(0, 500)
          });
        }
      }
    });

    return jobs;
  } catch (error) {
    console.error('Dice scraping error:', error.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function searchJobs(jobRole) {
  console.log(`Starting job search for: ${jobRole}`);
  
  const allJobs = [];
  
  // Scrape LinkedIn
  console.log('Scraping LinkedIn...');
  const linkedinJobs = await scrapeLinkedIn(jobRole);
  allJobs.push(...linkedinJobs);
  console.log(`Found ${linkedinJobs.length} jobs on LinkedIn`);
  
  // Scrape Indeed
  console.log('Scraping Indeed...');
  const indeedJobs = await scrapeIndeed(jobRole);
  allJobs.push(...indeedJobs);
  console.log(`Found ${indeedJobs.length} jobs on Indeed`);
  
  // Scrape Dice
  console.log('Scraping Dice...');
  const diceJobs = await scrapeDice(jobRole);
  allJobs.push(...diceJobs);
  console.log(`Found ${diceJobs.length} jobs on Dice`);
  
  console.log(`Total jobs found: ${allJobs.length}`);
  
  return allJobs;
}

module.exports = {
  searchJobs,
  extractEmail,
  extractPhone,
  isC2C,
  hasVisaRequirement,
  getVisaStatus
};
