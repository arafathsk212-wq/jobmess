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
  
  try {
    // Scrape LinkedIn
    console.log('Scraping LinkedIn...');
    const linkedinJobs = await scrapeLinkedIn(jobRole);
    allJobs.push(...linkedinJobs);
    console.log(`Found ${linkedinJobs.length} jobs on LinkedIn`);
  } catch (error) {
    console.error('LinkedIn scraping failed:', error.message);
  }
  
  try {
    // Scrape Indeed
    console.log('Scraping Indeed...');
    const indeedJobs = await scrapeIndeed(jobRole);
    allJobs.push(...indeedJobs);
    console.log(`Found ${indeedJobs.length} jobs on Indeed`);
  } catch (error) {
    console.error('Indeed scraping failed:', error.message);
  }
  
  try {
    // Scrape Dice
    console.log('Scraping Dice...');
    const diceJobs = await scrapeDice(jobRole);
    allJobs.push(...diceJobs);
    console.log(`Found ${diceJobs.length} jobs on Dice`);
  } catch (error) {
    console.error('Dice scraping failed:', error.message);
  }
  
  // If no jobs found, provide sample data for testing
  if (allJobs.length === 0) {
    console.log('No jobs found from scraping, providing sample data');
    allJobs.push(...getSampleJobs(jobRole));
  }
  
  console.log(`Total jobs found: ${allJobs.length}`);
  
  return allJobs;
}

function getSampleJobs(jobRole) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  
  const formatDate = (date) => date.toISOString().split('T')[0];
  
  return [
    {
      title: `${jobRole} - C2C Only`,
      company: 'Tech Solutions Inc',
      location: 'Dallas, TX',
      visaStatus: 'Green Card',
      employmentType: 'C2C',
      postedDate: formatDate(today),
      source: 'Sample Data',
      email: 'recruiter@techsolutions.com',
      phone: '+1-555-123-4567',
      description: `Looking for experienced ${jobRole} for immediate start. C2C only. Must have strong communication skills and be available for client interviews.`
    },
    {
      title: `Senior ${jobRole} - Prime Vendor`,
      company: 'Innovate Staffing',
      location: 'New York, NY',
      visaStatus: 'H-1B',
      employmentType: 'C2C',
      postedDate: formatDate(today),
      source: 'Sample Data',
      email: 'jobs@innovatestaffing.com',
      phone: '+1-555-987-6543',
      description: `Senior ${jobRole} needed for long-term project. C2C contract with prime vendor. Looking for candidates with 5+ years experience.`
    },
    {
      title: `${jobRole} - W2/C2C`,
      company: 'Cloud Systems LLC',
      location: 'San Francisco, CA',
      visaStatus: 'US Citizen',
      employmentType: 'C2C',
      postedDate: formatDate(yesterday),
      source: 'Sample Data',
      email: 'careers@cloudsystems.com',
      phone: '+1-555-456-7890',
      description: `${jobRole} position available. Both W2 and C2C considered. US Citizens preferred. Remote work possible.`
    },
    {
      title: `${jobRole} - Immediate Start`,
      company: 'Global IT Staffing',
      location: 'Chicago, IL',
      visaStatus: 'Green Card',
      employmentType: 'C2C',
      postedDate: formatDate(today),
      source: 'Sample Data',
      email: 'staffing@globalit.com',
      phone: '+1-555-321-0987',
      description: `Urgent requirement for ${jobRole}. C2C only, Green Card holders. Client interview scheduled for next week.`
    },
    {
      title: `${jobRole} - Financial Services`,
      company: 'FinTech Solutions',
      location: 'Charlotte, NC',
      visaStatus: 'H-1B',
      employmentType: 'C2C',
      postedDate: formatDate(yesterday),
      source: 'Sample Data',
      email: 'recruitment@fintechsolutions.com',
      phone: '+1-555-654-3210',
      description: `${jobRole} needed for banking client. C2C contract, H-1B transfer available. Financial domain experience preferred.`
    },
    {
      title: `${jobRole} - Healthcare Project`,
      company: 'MediCare IT',
      location: 'Boston, MA',
      visaStatus: 'EAD',
      employmentType: 'C2C',
      postedDate: formatDate(twoDaysAgo),
      source: 'Sample Data',
      email: 'jobs@medicareit.com',
      phone: '+1-555-789-0123',
      description: `${jobRole} for healthcare project. C2C, EAD/GC accepted. Healthcare IT experience is a plus. Long-term contract.`
    },
    {
      title: `${jobRole} - Remote Opportunity`,
      company: 'Remote Tech Corp',
      location: 'Remote',
      visaStatus: 'Green Card',
      employmentType: 'C2C',
      postedDate: formatDate(today),
      source: 'Sample Data',
      email: 'remote@remotetech.com',
      phone: '+1-555-234-5678',
      description: `100% remote ${jobRole} position. C2C only, Green Card required. Eastern timezone preferred.`
    },
    {
      title: `${jobRole} - Government Project`,
      company: 'GovTech Staffing',
      location: 'Washington DC',
      visaStatus: 'US Citizen',
      employmentType: 'C2C',
      postedDate: formatDate(yesterday),
      source: 'Sample Data',
      email: 'govjobs@govtech.com',
      phone: '+1-555-876-5432',
      description: `${jobRole} for government project. US Citizens only, C2C. Security clearance may be required.`
    },
    {
      title: `${jobRole} - E-commerce Platform`,
      company: 'Ecom Solutions',
      location: 'Seattle, WA',
      visaStatus: 'H-1B',
      employmentType: 'C2C',
      postedDate: formatDate(twoDaysAgo),
      source: 'Sample Data',
      email: 'careers@ecomsolutions.com',
      phone: '+1-555-109-8765',
      description: `${jobRole} for major e-commerce platform. C2C, H-1B transfer. High-volume transaction experience needed.`
    },
    {
      title: `${jobRole} - Startup Environment`,
      company: 'TechStart Inc',
      location: 'Austin, TX',
      visaStatus: 'Green Card',
      employmentType: 'C2C',
      postedDate: formatDate(today),
      source: 'Sample Data',
      email: 'hiring@techstart.com',
      phone: '+1-555-567-8901',
      description: `${jobRole} for fast-growing startup. C2C only, GC holders. Agile environment, rapid development cycles.`
    }
  ];
}

module.exports = {
  searchJobs,
  extractEmail,
  extractPhone,
  isC2C,
  hasVisaRequirement,
  getVisaStatus
};
