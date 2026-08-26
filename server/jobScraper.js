const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const axios = require('axios');
const RSSParser = require('rss-parser');

puppeteer.use(StealthPlugin());

const rssParser = new RSSParser();

// API Credentials from environment variables
const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID || '71f1e9f0';
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY || '1729831db5ca1895c9a8c409129cc8c4';
const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || '77hlemafrfeyk6';
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || 'your_linkedin_secret_here';

// Bright Data API credentials
const BRIGHT_DATA_API_KEY = process.env.BRIGHT_DATA_API_KEY || '7d9f273b-bda9-498a-8165-fec860f4dc6e';
const BRIGHT_DATA_DATASET_ID = process.env.BRIGHT_DATA_DATASET_ID || 'gd_lpfll7v5hcqtkxl6l';

const jobPortals = [
  { name: 'LinkedIn', url: 'https://www.linkedin.com/jobs/search/', type: 'linkedin' },
  { name: 'Indeed', url: 'https://www.indeed.com/jobs', type: 'indeed' },
  { name: 'Dice', url: 'https://www.dice.com/jobs', type: 'dice' },
  { name: 'Monster', url: 'https://www.monster.com/jobs', type: 'monster' },
];

const c2cKeywords = ['c2c', 'corp to corp', 'corptocorp', '1099', 'independent contractor'];
const visaKeywords = ['green card', 'gc', 'usc', 'us citizen', 'h1b', 'e-ad', 'ead', 'opt', 'cpt'];
const visaRequirements = ['green card', 'gc', 'usc', 'us citizen'];

/**
 * AI-Enhanced Job Analysis
 * This system analyzes every job post comprehensively to extract metadata
 * without filtering. All jobs are shown regardless of visa type, C2C/W2 mentions,
 * or contact information. Contact details are optional metadata for manual follow-up.
 */

function analyzeJobDescription(description) {
  const analysis = {
    hasC2C: false,
    hasW2: false,
    visaStatus: 'Not Specified',
    employmentType: 'Not Specified',
    hasEmail: false,
    hasPhone: false,
    hasContactInfo: false,
    skills: [],
    keywords: []
  };
  
  const lowerDesc = description.toLowerCase();
  
  // Analyze employment type
  if (c2cKeywords.some(keyword => lowerDesc.includes(keyword))) {
    analysis.hasC2C = true;
    analysis.employmentType = 'C2C';
  }
  if (lowerDesc.includes('w2') || lowerDesc.includes('w-2')) {
    analysis.hasW2 = true;
    if (analysis.employmentType === 'Not Specified') {
      analysis.employmentType = 'W2';
    }
  }
  
  // Analyze visa status
  if (lowerDesc.includes('green card') || lowerDesc.includes('gc')) {
    analysis.visaStatus = 'Green Card';
  } else if (lowerDesc.includes('usc') || lowerDesc.includes('us citizen')) {
    analysis.visaStatus = 'US Citizen';
  } else if (lowerDesc.includes('h1b')) {
    analysis.visaStatus = 'H-1B';
  } else if (lowerDesc.includes('e-ad') || lowerDesc.includes('ead')) {
    analysis.visaStatus = 'EAD';
  } else if (lowerDesc.includes('opt') || lowerDesc.includes('cpt')) {
    analysis.visaStatus = 'CPT/OPT';
  }
  
  // Analyze contact information
  const email = extractEmail(description);
  const phone = extractPhone(description);
  analysis.hasEmail = !!email;
  analysis.hasPhone = !!phone;
  analysis.hasContactInfo = analysis.hasEmail || analysis.hasPhone;
  
  // Extract common IT skills
  const skillPatterns = [
    'javascript', 'java', 'python', 'react', 'angular', 'vue', 'node', 'sql',
    'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'devops', 'agile', 'scrum',
    'git', 'ci/cd', 'microservices', 'api', 'rest', 'graphql', 'mongodb',
    'postgresql', 'mysql', 'redis', 'elasticsearch', 'kafka', 'spark', 'hadoop'
  ];
  
  skillPatterns.forEach(skill => {
    if (lowerDesc.includes(skill)) {
      analysis.skills.push(skill);
    }
  });
  
  return analysis;
}

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
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // Set realistic headers
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set additional headers to look like a real browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });

    const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(jobRole)}&f_TPR=r86400&f_JT=F`;
    console.log(`LinkedIn URL: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 45000 });

    // Wait for content to load
    await page.waitForTimeout(5000);

    const content = await page.content();
    const $ = cheerio.load(content);

    const jobs = [];
    
    // Try multiple selectors for LinkedIn job cards
    const selectors = [
      '.job-card-container',
      '.jobs-search__results-list li',
      '.job-search-card',
      '[data-job-id]'
    ];
    
    for (const selector of selectors) {
      $(selector).each((index, element) => {
        const $el = $(element);
        const title = $el.find('.job-title, .job-search-card__title').text().trim() || 
                     $el.find('h3, h4').first().text().trim();
        const company = $el.find('.company-name, .job-search-card__subtitle-primary').text().trim() ||
                       $el.find('[data-anonymize="company-name"]').text().trim();
        const location = $el.find('.job-location, .job-search-card__subtitle-secondary').text().trim() ||
                        $el.find('[data-anonymize="job-location"]').text().trim();
        const description = $el.find('.job-description, .job-search-card__description').text().trim() ||
                           $el.find('.show-more-less-html').text().trim();
        
        if (title && company) {
          const analysis = analyzeJobDescription(description);
          
          // Show all jobs regardless of visa type or C2C mention
          // AI analyzes job details for metadata but doesn't filter
          jobs.push({
            title,
            company,
            location,
            visaStatus: analysis.visaStatus,
            employmentType: analysis.employmentType,
            postedDate: new Date().toISOString().split('T')[0],
            source: 'LinkedIn',
            email: extractEmail(description) || 'Not Provided',
            phone: extractPhone(description) || 'Not Provided',
            description: description.substring(0, 500),
            hasContactInfo: analysis.hasContactInfo,
            skills: analysis.skills
          });
        }
      });
      
      if (jobs.length > 0) break; // Stop if we found jobs with this selector
    }

    console.log(`LinkedIn scraping found ${jobs.length} jobs`);
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
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // Set realistic headers
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });

    const searchUrl = `https://www.indeed.com/jobs?q=${encodeURIComponent(jobRole)}&fromage=1`;
    console.log(`Indeed URL: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 45000 });

    // Wait for content to load
    await page.waitForTimeout(5000);

    const content = await page.content();
    const $ = cheerio.load(content);

    const jobs = [];
    
    // Try multiple selectors for Indeed job cards
    const selectors = [
      '.jobsearch-SerpJobCard',
      '.job_seen_beacon',
      '.css-1x7z1ps',
      '[data-jk]'
    ];
    
    for (const selector of selectors) {
      $(selector).each((index, element) => {
        const $el = $(element);
        const title = $el.find('.jobTitle, h2, .jcs-JobTitle').text().trim() ||
                     $el.find('[data-testid="job-title"]').text().trim();
        const company = $el.find('.companyName, .companyInfo, [data-testid="company-name"]').text().trim();
        const location = $el.find('.companyLocation, [data-testid="job-location"]').text().trim();
        const description = $el.find('.job-snippet, .job-description').text().trim() ||
                           $el.find('[data-testid="job-snippet"]').text().trim();
        
        if (title && company) {
          const analysis = analyzeJobDescription(description);
          
          // Show all jobs regardless of visa type or C2C mention
          // AI analyzes job details for metadata but doesn't filter
          jobs.push({
            title,
            company,
            location,
            visaStatus: analysis.visaStatus,
            employmentType: analysis.employmentType,
            postedDate: new Date().toISOString().split('T')[0],
            source: 'Indeed',
            email: extractEmail(description) || 'Not Provided',
            phone: extractPhone(description) || 'Not Provided',
            description: description.substring(0, 500),
            hasContactInfo: analysis.hasContactInfo,
            skills: analysis.skills
          });
        }
      });
      
      if (jobs.length > 0) break; // Stop if we found jobs with this selector
    }

    console.log(`Indeed scraping found ${jobs.length} jobs`);
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
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // Set realistic headers
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });

    const searchUrl = `https://www.dice.com/jobs?q=${encodeURIComponent(jobRole)}&sort=date&limit=20`;
    console.log(`Dice URL: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 45000 });

    // Wait for content to load
    await page.waitForTimeout(5000);

    const content = await page.content();
    const $ = cheerio.load(content);

    const jobs = [];
    
    // Try multiple selectors for Dice job cards
    const selectors = [
      '.search-result',
      '.card',
      '.job-card',
      '[data-cy="job"]'
    ];
    
    for (const selector of selectors) {
      $(selector).each((index, element) => {
        const $el = $(element);
        const title = $el.find('.jobTitle, h3, .card-title').text().trim() ||
                     $el.find('[data-testid="job-title"]').text().trim();
        const company = $el.find('.company, .card-company, [data-testid="company-name"]').text().trim();
        const location = $el.find('.location, .card-location, [data-testid="location"]').text().trim();
        const description = $el.find('.shortdesc, .card-description, .job-description').text().trim() ||
                           $el.find('[data-testid="job-description"]').text().trim();
        
        if (title && company) {
          const analysis = analyzeJobDescription(description);
          
          // Show all jobs regardless of visa type or C2C mention
          // AI analyzes job details for metadata but doesn't filter
          jobs.push({
            title,
            company,
            location,
            visaStatus: analysis.visaStatus,
            employmentType: analysis.employmentType,
            postedDate: new Date().toISOString().split('T')[0],
            source: 'Dice',
            email: extractEmail(description) || 'Not Provided',
            phone: extractPhone(description) || 'Not Provided',
            description: description.substring(0, 500),
            hasContactInfo: analysis.hasContactInfo,
            skills: analysis.skills
          });
        }
      });
      
      if (jobs.length > 0) break; // Stop if we found jobs with this selector
    }

    console.log(`Dice scraping found ${jobs.length} jobs`);
    return jobs;
  } catch (error) {
    console.error('Dice scraping error:', error.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function scrapeMonster(jobRole) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    const searchUrl = `https://www.monster.com/jobs/search/?q=${encodeURIComponent(jobRole)}`;
    console.log(`Monster URL: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(3000);

    const content = await page.content();
    const $ = cheerio.load(content);

    const jobs = [];
    $('.card, .job-card, [data-testid="job-card"]').each((index, element) => {
      const $el = $(element);
      const title = $el.find('h3, .job-title, [data-testid="job-title"]').text().trim();
      const company = $el.find('.company-name, [data-testid="company-name"]').text().trim();
      const location = $el.find('.location, [data-testid="location"]').text().trim();
      const description = $el.find('.job-description, [data-testid="job-description"]').text().trim();
      
      if (title && company) {
        const analysis = analyzeJobDescription(description);
        
        // Show all jobs regardless of visa type or C2C mention
        // AI analyzes job details for metadata but doesn't filter
        jobs.push({
          title,
          company,
          location,
          visaStatus: analysis.visaStatus,
          employmentType: analysis.employmentType,
          postedDate: new Date().toISOString().split('T')[0],
          source: 'Monster',
          email: extractEmail(description) || 'Not Provided',
          phone: extractPhone(description) || 'Not Provided',
          description: description.substring(0, 500),
          hasContactInfo: analysis.hasContactInfo,
          skills: analysis.skills
        });
      }
    });

    console.log(`Monster scraping found ${jobs.length} jobs`);
    return jobs;
  } catch (error) {
    console.error('Monster scraping error:', error.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function scrapeCareerBuilder(jobRole) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    const searchUrl = `https://www.careerbuilder.com/jobs?q=${encodeURIComponent(jobRole)}`;
    console.log(`CareerBuilder URL: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(3000);

    const content = await page.content();
    const $ = cheerio.load(content);

    const jobs = [];
    $('.data-results, .job-listing, .job-card').each((index, element) => {
      const $el = $(element);
      const title = $el.find('.job-title, h2, [data-testid="job-title"]').text().trim();
      const company = $el.find('.company, [data-testid="company-name"]').text().trim();
      const location = $el.find('.location, [data-testid="location"]').text().trim();
      const description = $el.find('.job-description, [data-testid="job-description"]').text().trim();
      
      if (title && company) {
        const analysis = analyzeJobDescription(description);
        
        // Show all jobs regardless of visa type or C2C mention
        // AI analyzes job details for metadata but doesn't filter
        jobs.push({
          title,
          company,
          location,
          visaStatus: analysis.visaStatus,
          employmentType: analysis.employmentType,
          postedDate: new Date().toISOString().split('T')[0],
          source: 'CareerBuilder',
          email: extractEmail(description) || 'Not Provided',
          phone: extractPhone(description) || 'Not Provided',
          description: description.substring(0, 500),
          hasContactInfo: analysis.hasContactInfo,
          skills: analysis.skills
        });
      }
    });

    console.log(`CareerBuilder scraping found ${jobs.length} jobs`);
    return jobs;
  } catch (error) {
    console.error('CareerBuilder scraping error:', error.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function scrapeSimplyHired(jobRole) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    const searchUrl = `https://www.simplyhired.com/search?q=${encodeURIComponent(jobRole)}`;
    console.log(`SimplyHired URL: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(3000);

    const content = await page.content();
    const $ = cheerio.load(content);

    const jobs = [];
    $('.card, .job-card, .job-listing').each((index, element) => {
      const $el = $(element);
      const title = $el.find('.job-title, h2, [data-testid="job-title"]').text().trim();
      const company = $el.find('.company-name, [data-testid="company-name"]').text().trim();
      const location = $el.find('.location, [data-testid="location"]').text().trim();
      const description = $el.find('.job-description, [data-testid="job-description"]').text().trim();
      
      if (title && company) {
        const analysis = analyzeJobDescription(description);
        
        // Show all jobs regardless of visa type or C2C mention
        // AI analyzes job details for metadata but doesn't filter
        jobs.push({
          title,
          company,
          location,
          visaStatus: analysis.visaStatus,
          employmentType: analysis.employmentType,
          postedDate: new Date().toISOString().split('T')[0],
          source: 'SimplyHired',
          email: extractEmail(description) || 'Not Provided',
          phone: extractPhone(description) || 'Not Provided',
          description: description.substring(0, 500),
          hasContactInfo: analysis.hasContactInfo,
          skills: analysis.skills
        });
      }
    });

    console.log(`SimplyHired scraping found ${jobs.length} jobs`);
    return jobs;
  } catch (error) {
    console.error('SimplyHired scraping error:', error.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function searchJobs(jobRole) {
  console.log(`Starting job search for: ${jobRole}`);
  
  const allJobs = [];
  
  // Try Adzuna API (most reliable for real jobs)
  try {
    console.log('Fetching from Adzuna API...');
    const adzunaJobs = await fetchAdzunaJobs(jobRole);
    allJobs.push(...adzunaJobs);
    console.log(`Found ${adzunaJobs.length} jobs from Adzuna API`);
  } catch (error) {
    console.error('Adzuna API error:', error.message);
  }
  
  // Try LinkedIn via Bright Data API
  try {
    console.log('Fetching from LinkedIn via Bright Data...');
    const linkedinJobs = await fetchLinkedInJobs(jobRole);
    allJobs.push(...linkedinJobs);
    console.log(`Found ${linkedinJobs.length} jobs from LinkedIn (Bright Data)`);
  } catch (error) {
    console.error('LinkedIn Bright Data error:', error.message);
  }
  
  // Try RSS feeds as backup
  try {
    console.log('Fetching from RSS feeds...');
    const rssJobs = await fetchRSSJobs(jobRole);
    allJobs.push(...rssJobs);
    console.log(`Found ${rssJobs.length} jobs from RSS feeds`);
  } catch (error) {
    console.error('RSS feed error:', error.message);
  }
  
  // Note: Web scraping disabled due to Railway environment limitations
  // Puppeteer/Chrome not available in Railway container environment
  console.log('Web scraping skipped - Chrome not available in Railway environment');
  
  console.log(`Total jobs found from all sources: ${allJobs.length}`);
  
  // Only use sample data as last resort if absolutely no jobs found
  if (allJobs.length === 0) {
    console.log('No real jobs found from any source, using realistic sample data as fallback');
    allJobs.push(...generateRealisticSampleJobs(jobRole));
    console.log('Note: These are sample jobs. To get real jobs, ensure API credentials are correctly configured in Railway environment variables.');
  }
  
  console.log(`Total jobs to return: ${allJobs.length}`);
  
  return allJobs;
}

async function fetchRSSJobs(jobRole) {
  const jobs = [];
  
  // RSS feeds from various job boards - using more reliable feeds
  const rssFeeds = [
    {
      name: 'Indeed RSS',
      url: `https://rss.indeed.com/rss?q=${encodeURIComponent(jobRole)}&l=United%20States&fromage=1`,
      parser: parseIndeedRSS
    },
    {
      name: 'Dice RSS',
      url: `https://www.dice.com/feed/jobs?q=${encodeURIComponent(jobRole)}&country=US`,
      parser: parseDiceRSS
    },
    {
      name: 'SimplyHired RSS',
      url: `https://www.simplyhired.com/job-feed/rss?q=${encodeURIComponent(jobRole)}&l=United%20States`,
      parser: parseGenericRSS
    },
    {
      name: 'ZipRecruiter RSS',
      url: `https://www.ziprecruiter.com/feed/jobs?q=${encodeURIComponent(jobRole)}&location=United%20States`,
      parser: parseGenericRSS
    },
    {
      name: 'Jooble RSS',
      url: `https://jooble.org/rss?q=${encodeURIComponent(jobRole)}&l=United%20States`,
      parser: parseGenericRSS
    }
  ];
  
  for (const feed of rssFeeds) {
    try {
      console.log(`Fetching ${feed.name} from: ${feed.url}`);
      const response = await axios.get(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 30000
      });
      
      console.log(`${feed.name} response status: ${response.status}`);
      console.log(`${feed.name} response length: ${response.data.length}`);
      
      const feedData = await rssParser.parseString(response.data);
      console.log(`${feed.name} parsed feed items: ${feedData.items ? feedData.items.length : 0}`);
      
      const feedJobs = feed.parser(feedData, jobRole, feed.name);
      jobs.push(...feedJobs);
      console.log(`Found ${feedJobs.length} jobs from ${feed.name}`);
    } catch (error) {
      console.error(`${feed.name} error:`, error.message);
      console.error(`${feed.name} error details:`, error.response ? error.response.status : 'No response');
    }
  }
  
  console.log(`Total RSS jobs found: ${jobs.length}`);
  return jobs;
}

/**
 * Fetch jobs from Adzuna API
 */
async function fetchAdzunaJobs(jobRole) {
  const jobs = [];
  try {
    console.log('Fetching jobs from Adzuna API...');
    
    // Adzuna API endpoint for US jobs
    // Format: https://api.adzuna.com/v1/api/{country_code}/search/{page}
    const baseUrl = 'https://api.adzuna.com/v1/api/jobs/us/search/1';
    
    const params = {
      app_id: ADZUNA_APP_ID,
      app_key: ADZUNA_APP_KEY,
      what: jobRole,
      where: 'us',
      content_type: 'application/json',
      max_days_old: 30
    };
    
    console.log(`Adzuna API request: ${baseUrl}`);
    console.log(`Adzuna params: what=${jobRole}, where=us`);
    console.log(`Using App ID: ${ADZUNA_APP_ID}`);
    console.log(`Using App Key: ${ADZUNA_APP_KEY.substring(0, 8)}...`);
    
    const response = await axios.get(baseUrl, { 
      params,
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json'
      }
    });
    
    console.log(`Adzuna API response status: ${response.status}`);
    console.log(`Adzuna API response type: ${typeof response.data}`);
    
    if (response.data && response.data.results) {
      console.log(`Adzuna returned ${response.data.results.length} results`);
      for (const job of response.data.results) {
        const description = job.description || '';
        const analysis = analyzeJobDescription(description);
        
        jobs.push({
          title: job.title || 'Not Specified',
          company: job.company?.display_name || 'Not Specified',
          location: job.location?.display_name || 'Not Specified',
          visaStatus: analysis.visaStatus,
          employmentType: analysis.employmentType,
          postedDate: job.created ? new Date(job.created).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          source: 'Adzuna',
          email: extractEmail(description) || 'Not Provided',
          phone: extractPhone(description) || 'Not Provided',
          description: description.substring(0, 500),
          link: job.redirect_url || job.url,
          hasContactInfo: analysis.hasContactInfo,
          skills: analysis.skills
        });
      }
      console.log(`Found ${jobs.length} jobs from Adzuna API`);
    } else {
      console.log('Adzuna API response has no results');
      console.log('Response data keys:', Object.keys(response.data || {}));
      console.log('Response data:', JSON.stringify(response.data).substring(0, 500));
    }
  } catch (error) {
    console.error('Adzuna API error:', error.message);
    console.error('Adzuna API error details:', error.response ? error.response.data : 'No response');
    console.error('Adzuna API error status:', error.response ? error.response.status : 'No status');
    console.error('Adzuna API error headers:', error.response ? error.response.headers : 'No headers');
    
    // Try alternative endpoint format
    try {
      console.log('Trying alternative Adzuna endpoint format...');
      const altUrl = `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_APP_KEY}&what=${encodeURIComponent(jobRole)}&where=us&content-type=application/json`;
      
      const altResponse = await axios.get(altUrl, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      console.log(`Alternative Adzuna response status: ${altResponse.status}`);
      
      if (altResponse.data && altResponse.data.results) {
        console.log(`Alternative Adzuna returned ${altResponse.data.results.length} results`);
        for (const job of altResponse.data.results) {
          const description = job.description || '';
          const analysis = analyzeJobDescription(description);
          
          jobs.push({
            title: job.title || 'Not Specified',
            company: job.company?.display_name || 'Not Specified',
            location: job.location?.display_name || 'Not Specified',
            visaStatus: analysis.visaStatus,
            employmentType: analysis.employmentType,
            postedDate: job.created ? new Date(job.created).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            source: 'Adzuna',
            email: extractEmail(description) || 'Not Provided',
            phone: extractPhone(description) || 'Not Provided',
            description: description.substring(0, 500),
            link: job.redirect_url || job.url,
            hasContactInfo: analysis.hasContactInfo,
            skills: analysis.skills
          });
        }
        console.log(`Found ${jobs.length} jobs from alternative Adzuna endpoint`);
      }
    } catch (altError) {
      console.error('Alternative Adzuna endpoint also failed:', altError.message);
    }
  }
  
  return jobs;
}

/**
 * Generate realistic sample jobs as fallback
 */
function generateRealisticSampleJobs(jobRole) {
  const jobs = [];
  const companies = [
    { name: 'TechCorp Solutions', location: 'San Francisco, CA' },
    { name: 'InnovateTech Inc', location: 'New York, NY' },
    { name: 'DigitalFirst Agency', location: 'Austin, TX' },
    { name: 'CloudSystems LLC', location: 'Seattle, WA' },
    { name: 'DataDriven Co', location: 'Boston, MA' },
    { name: 'FutureTech Solutions', location: 'Chicago, IL' },
    { name: 'WebWorks Inc', location: 'Los Angeles, CA' },
    { name: 'CodeCrafters LLC', location: 'Denver, CO' }
  ];
  
  const descriptions = [
    `We are looking for a talented ${jobRole} to join our growing team. The ideal candidate will have strong experience in modern web technologies and a passion for building scalable applications. This role offers competitive salary, remote work options, and comprehensive benefits.`,
    `Join our innovative company as a ${jobRole}. You'll work on cutting-edge projects using the latest technologies. We offer flexible working hours, professional development opportunities, and a collaborative team environment.`,
    `Exciting opportunity for a skilled ${jobRole} to work on enterprise-level applications. Must have experience with cloud services, microservices architecture, and agile methodologies. Great benefits package included.`,
    `We're seeking a ${jobRole} with expertise in building high-performance applications. You'll collaborate with cross-functional teams to deliver exceptional user experiences. Competitive compensation and growth opportunities.`,
    `Looking for a ${jobRole} to help transform our digital presence. Experience with modern frameworks, CI/CD pipelines, and test-driven development is required. Remote-friendly culture with excellent benefits.`
  ];
  
  const now = new Date();
  
  for (let i = 0; i < 12; i++) {
    const company = companies[i % companies.length];
    const description = descriptions[i % descriptions.length];
    const analysis = analyzeJobDescription(description);
    const postedDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    jobs.push({
      title: jobRole,
      company: company.name,
      location: company.location,
      visaStatus: analysis.visaStatus,
      employmentType: analysis.employmentType,
      postedDate: postedDate,
      source: 'Sample Data',
      email: `careers@${company.name.toLowerCase().replace(/\s+/g, '')}.com`,
      phone: `+1-555-${String(100 + i).padStart(3, '0')}-${String(1000 + i * 111).padStart(4, '0')}`,
      description: description,
      hasContactInfo: true,
      skills: analysis.skills
    });
  }
  
  return jobs;
}

/**
 * Fetch jobs from LinkedIn API using Bright Data
 */
async function fetchLinkedInJobs(jobRole) {
  const jobs = [];
  try {
    console.log('Fetching LinkedIn jobs via Bright Data API...');
    
    // Use Bright Data API to scrape LinkedIn job listings
    // Try async API which might return actual job data
    const apiUrl = `https://api.brightdata.com/datasets/v3/scrape`;
    
    // Construct LinkedIn job search URL
    const linkedinSearchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(jobRole)}&location=United%20States&f_TPR=r86400`; // Past 24 hours
    
    console.log(`Bright Data API request for LinkedIn jobs: ${jobRole}`);
    console.log(`LinkedIn search URL: ${linkedinSearchUrl}`);
    console.log(`Using dataset ID: ${BRIGHT_DATA_DATASET_ID}`);
    
    // Try with different parameters
    const response = await axios.post(
      `${apiUrl}?dataset_id=${BRIGHT_DATA_DATASET_ID}&format=json&include_errors=true`,
      [{ url: linkedinSearchUrl }],
      {
        headers: {
          'Authorization': `Bearer ${BRIGHT_DATA_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000 // 120 second timeout for async scraping
      }
    );
    
    console.log(`Bright Data API response status: ${response.status}`);
    console.log(`Bright Data response type: ${typeof response.data}`);
    console.log(`Bright Data response keys:`, Object.keys(response.data || {}));
    
    // Check if response has snapshot ID (async mode)
    if (response.data && response.data.snapshot_id) {
      console.log(`Async scraping started. Snapshot ID: ${response.data.snapshot_id}`);
      console.log('Waiting for async results...');
      
      // Poll for results
      const snapshotId = response.data.snapshot_id;
      let attempts = 0;
      const maxAttempts = 30; // 5 minutes max
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        
        try {
          const statusResponse = await axios.get(
            `https://api.brightdata.com/datasets/v3/snapshots/${snapshotId}`,
            {
              headers: {
                'Authorization': `Bearer ${BRIGHT_DATA_API_KEY}`
              }
            }
          );
          
          console.log(`Snapshot status: ${statusResponse.data.status}`);
          
          if (statusResponse.data.status === 'ready' || statusResponse.data.status === 'completed') {
            console.log('Snapshot ready, fetching results...');
            
            // Get the actual data
            const dataResponse = await axios.get(
              `https://api.brightdata.com/datasets/v3/snapshots/${snapshotId}/data`,
              {
                headers: {
                  'Authorization': `Bearer ${BRIGHT_DATA_API_KEY}`
                }
              }
            );
            
            console.log(`Got ${dataResponse.data.length} records from snapshot`);
            processBrightDataJobs(dataResponse.data, jobs);
            break;
          }
          
          attempts++;
        } catch (pollError) {
          console.error('Error polling snapshot:', pollError.message);
          attempts++;
        }
      }
      
      if (attempts >= maxAttempts) {
        console.log('Async scraping timed out');
      }
    } else {
      // Try to process immediate response
      processBrightDataJobs(response.data, jobs);
    }
    
    console.log(`Successfully parsed ${jobs.length} LinkedIn jobs from Bright Data`);
  } catch (error) {
    console.error('Bright Data API error:', error.message);
    console.error('Bright Data error details:', error.response ? error.response.data : 'No response');
    console.error('Bright Data error status:', error.response ? error.response.status : 'No status');
  }
  
  return jobs;
}

function processBrightDataJobs(data, jobs) {
  let jobDataArray = [];
  
  if (Array.isArray(data)) {
    jobDataArray = data;
  } else if (data && data.results && Array.isArray(data.results)) {
    jobDataArray = data.results;
  } else if (data && data.data && Array.isArray(data.data)) {
    jobDataArray = data.data;
  } else if (data && typeof data === 'object') {
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key])) {
        jobDataArray = data[key];
        console.log(`Found job data in key: ${key}`);
        break;
      }
    }
  }
  
  console.log(`Extracted ${jobDataArray.length} job records from Bright Data response`);
  
  if (jobDataArray.length > 0) {
    console.log('Bright Data response sample:', JSON.stringify(jobDataArray[0]).substring(0, 1000));
    
    for (const jobData of jobDataArray) {
      try {
        const title = jobData.title || jobData.job_title || jobData.jobTitle || jobData.position || 'Not Specified';
        const company = jobData.company_name || jobData.company || jobData.companyName || jobData.employer || 'Not Specified';
        const location = jobData.location || jobData.job_location || jobData.jobLocation || jobData.place || 'Not Specified';
        const description = jobData.description || jobData.job_description || jobData.jobDescription || jobData.details || '';
        const link = jobData.url || jobData.job_url || jobData.jobUrl || jobData.link || jobData.applyUrl || '';
        
        console.log(`Processing LinkedIn job: ${title} at ${company}`);
        
        const analysis = analyzeJobDescription(description);
        
        const job = {
          title: title,
          company: company,
          location: location,
          visaStatus: analysis.visaStatus,
          employmentType: analysis.employmentType,
          postedDate: jobData.posted_date || jobData.date || jobData.postedAt || new Date().toISOString().split('T')[0],
          source: 'LinkedIn (Bright Data)',
          email: extractEmail(description) || 'Not Provided',
          phone: extractPhone(description) || 'Not Provided',
          description: description.substring(0, 500),
          link: link,
          hasContactInfo: analysis.hasContactInfo,
          skills: analysis.skills
        };
        
        console.log(`Job object created:`, JSON.stringify(job).substring(0, 500));
        jobs.push(job);
      } catch (jobError) {
        console.error('Error parsing Bright Data job record:', jobError.message);
        console.error('Job data that failed:', JSON.stringify(jobData).substring(0, 500));
      }
    }
  } else {
    console.log('Bright Data API returned no job data');
    console.log('Full response:', JSON.stringify(data).substring(0, 2000));
  }
}

function parseIndeedRSS(feed, jobRole, sourceName = 'Indeed RSS') {
  const jobs = [];
  
  if (!feed.items) return jobs;
  
  for (const item of feed.items) {
    const description = item.contentSnippet || item.description || '';
    const title = item.title || '';
    
    // Show all jobs regardless of visa type or C2C mention
    // AI analyzes job details for metadata but doesn't filter
    const analysis = analyzeJobDescription(description);
    
    jobs.push({
      title: title,
      company: extractCompanyFromTitle(title),
      location: extractLocationFromDescription(description),
      visaStatus: analysis.visaStatus,
      employmentType: analysis.employmentType,
      postedDate: new Date(item.pubDate).toISOString().split('T')[0],
      source: sourceName,
      email: extractEmail(description) || 'Not Provided',
      phone: extractPhone(description) || 'Not Provided',
      description: description.substring(0, 500),
      link: item.link,
      hasContactInfo: analysis.hasContactInfo,
      skills: analysis.skills
    });
  }
  
  return jobs;
}

function parseDiceRSS(feed, jobRole, sourceName = 'Dice RSS') {
  const jobs = [];
  
  if (!feed.items) return jobs;
  
  for (const item of feed.items) {
    const description = item.contentSnippet || item.description || '';
    const title = item.title || '';
    
    // Show all jobs regardless of visa type or C2C mention
    // AI analyzes job details for metadata but doesn't filter
    const analysis = analyzeJobDescription(description);
    
    jobs.push({
      title: title,
      company: extractCompanyFromTitle(title),
      location: extractLocationFromDescription(description),
      visaStatus: analysis.visaStatus,
      employmentType: analysis.employmentType,
      postedDate: new Date(item.pubDate).toISOString().split('T')[0],
      source: sourceName,
      email: extractEmail(description) || 'Not Provided',
      phone: extractPhone(description) || 'Not Provided',
      description: description.substring(0, 500),
      link: item.link,
      hasContactInfo: analysis.hasContactInfo,
      skills: analysis.skills
    });
  }
  
  return jobs;
}

function parseGenericRSS(feed, jobRole, sourceName) {
  const jobs = [];
  
  if (!feed.items) return jobs;
  
  for (const item of feed.items) {
    const description = item.contentSnippet || item.description || item.content || '';
    const title = item.title || '';
    
    // Show all jobs regardless of visa type or C2C mention
    // AI analyzes job details for metadata but doesn't filter
    const analysis = analyzeJobDescription(description);
    
    jobs.push({
      title: title,
      company: extractCompanyFromTitle(title),
      location: extractLocationFromDescription(description),
      visaStatus: analysis.visaStatus,
      employmentType: analysis.employmentType,
      postedDate: new Date(item.pubDate).toISOString().split('T')[0],
      source: sourceName,
      email: extractEmail(description) || 'Not Provided',
      phone: extractPhone(description) || 'Not Provided',
      description: description.substring(0, 500),
      link: item.link,
      hasContactInfo: analysis.hasContactInfo,
      skills: analysis.skills
    });
  }
  
  return jobs;
}

function extractCompanyFromTitle(title) {
  // Try to extract company name from title
  const parts = title.split('-');
  if (parts.length > 1) {
    return parts[parts.length - 1].trim();
  }
  return 'Unknown Company';
}

function extractLocationFromDescription(description) {
  // Simple location extraction - look for common patterns
  const locationPatterns = [
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*[A-Z]{2})/,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/
  ];
  
  for (const pattern of locationPatterns) {
    const match = description.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return 'Location Not Specified';
}

function getSampleJobs(jobRole) {
  const now = new Date();
  const jobs = [];
  
  // Generate jobs with timestamps spread over the last 24 hours
  const timeOffsets = [0, 1, 2, 3, 4, 5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720, 900, 1080, 1260, 1440]; // minutes ago (up to 24 hours)
  
  const companies = [
    { name: 'Tech Solutions Inc', location: 'Dallas, TX', visa: 'Green Card' },
    { name: 'Innovate Staffing', location: 'New York, NY', visa: 'H-1B' },
    { name: 'Cloud Systems LLC', location: 'San Francisco, CA', visa: 'US Citizen' },
    { name: 'Global IT Staffing', location: 'Chicago, IL', visa: 'Green Card' },
    { name: 'FinTech Solutions', location: 'Charlotte, NC', visa: 'H-1B' },
    { name: 'MediCare IT', location: 'Boston, MA', visa: 'EAD' },
    { name: 'Remote Tech Corp', location: 'Remote', visa: 'Green Card' },
    { name: 'GovTech Staffing', location: 'Washington DC', visa: 'US Citizen' },
    { name: 'Ecom Solutions', location: 'Seattle, WA', visa: 'H-1B' },
    { name: 'TechStart Inc', location: 'Austin, TX', visa: 'Green Card' },
    { name: 'DataFlow Systems', location: 'Denver, CO', visa: 'Green Card' },
    { name: 'CyberSecure Inc', location: 'Miami, FL', visa: 'H-1B' },
    { name: 'CloudFirst Tech', location: 'Phoenix, AZ', visa: 'US Citizen' },
    { name: 'DevOps Masters', location: 'Portland, OR', visa: 'EAD' },
    { name: 'AI Solutions', location: 'San Diego, CA', visa: 'Green Card' },
    { name: 'Enterprise IT', location: 'Houston, TX', visa: 'Green Card' },
    { name: 'Prime Vendor Inc', location: 'Atlanta, GA', visa: 'H-1B' },
    { name: 'TechBridge LLC', location: 'Minneapolis, MN', visa: 'US Citizen' },
    { name: 'CloudScale Systems', location: 'Tampa, FL', visa: 'Green Card' },
    { name: 'DataDriven Inc', location: 'Nashville, TN', visa: 'EAD' },
    { name: 'SecureNet Solutions', location: 'Salt Lake City, UT', visa: 'H-1B' },
    { name: 'FutureTech Staffing', location: 'Kansas City, MO', visa: 'Green Card' },
    { name: 'Digital First Corp', location: 'Raleigh, NC', visa: 'US Citizen' },
    { name: 'Smart IT Solutions', location: 'Indianapolis, IN', visa: 'Green Card' }
  ];

  const descriptions = [
    `Looking for experienced ${jobRole} for immediate start. C2C only. Must have strong communication skills and be available for client interviews.`,
    `Senior ${jobRole} needed for long-term project. C2C contract with prime vendor. Looking for candidates with 5+ years experience.`,
    `${jobRole} position available. Both W2 and C2C considered. US Citizens preferred. Remote work possible.`,
    `Urgent requirement for ${jobRole}. C2C only, Green Card holders. Client interview scheduled for next week.`,
    `${jobRole} needed for banking client. C2C contract, H-1B transfer available. Financial domain experience preferred.`,
    `${jobRole} for healthcare project. C2C, EAD/GC accepted. Healthcare IT experience is a plus. Long-term contract.`,
    `100% remote ${jobRole} position. C2C only, Green Card required. Eastern timezone preferred.`,
    `${jobRole} for government project. US Citizens only, C2C. Security clearance may be required.`,
    `${jobRole} for major e-commerce platform. C2C, H-1B transfer. High-volume transaction experience needed.`,
    `${jobRole} for fast-growing startup. C2C only, GC holders. Agile environment, rapid development cycles.`,
    `${jobRole} for data analytics project. C2C, Green Card preferred. Big data experience required.`,
    `${jobRole} for cybersecurity firm. C2C, H-1B transfer available. Security clearance preferred.`,
    `${jobRole} for cloud migration project. C2C, US Citizens only. AWS/Azure experience required.`,
    `${jobRole} for DevOps team. C2C, EAD/GC accepted. CI/CD pipeline experience needed.`,
    `${jobRole} for AI/ML project. C2C, Green Card holders. Machine learning experience required.`,
    `${jobRole} for enterprise client. C2C only, GC holders. Large-scale system experience.`,
    `${jobRole} for prime vendor role. C2C, H-1B transfer. Direct client interaction.`,
    `${jobRole} for retail chain. C2C, US Citizens. Point of sale systems experience.`,
    `${jobRole} for logistics company. C2C, Green Card. Supply chain software experience.`,
    `${jobRole} for manufacturing firm. C2C, EAD/GC. ERP systems experience required.`,
    `${jobRole} for insurance company. C2C, H-1B transfer. Policy management systems.`,
    `${jobRole} for telecom provider. C2C, Green Card. Network management experience.`,
    `${jobRole} for energy sector. C2C, US Citizens. SCADA systems experience.`,
    `${jobRole} for education tech. C2C, Green Card. Learning management systems.`,
    // Jobs without C2C/visa mentions
    `Looking for experienced ${jobRole} for immediate start. Must have strong communication skills and be available for client interviews.`,
    `Senior ${jobRole} needed for long-term project. Looking for candidates with 5+ years experience.`,
    `${jobRole} position available. Remote work possible. Great company culture.`,
    `Urgent requirement for ${jobRole}. Client interview scheduled for next week.`,
    `${jobRole} needed for banking client. Financial domain experience preferred.`,
    `${jobRole} for healthcare project. Healthcare IT experience is a plus. Long-term contract.`,
    `100% remote ${jobRole} position. Eastern timezone preferred.`,
    `${jobRole} for government project. Security clearance may be required.`,
    `${jobRole} for major e-commerce platform. High-volume transaction experience needed.`,
    `${jobRole} for fast-growing startup. Agile environment, rapid development cycles.`,
    `${jobRole} for data analytics project. Big data experience required.`,
    `${jobRole} for cybersecurity firm. Security clearance preferred.`,
    `${jobRole} for cloud migration project. AWS/Azure experience required.`,
    `${jobRole} for DevOps team. CI/CD pipeline experience needed.`,
    `${jobRole} for AI/ML project. Machine learning experience required.`,
    `${jobRole} for enterprise client. Large-scale system experience.`,
    `${jobRole} for prime vendor role. Direct client interaction.`,
    `${jobRole} for retail chain. Point of sale systems experience.`,
    `${jobRole} for logistics company. Supply chain software experience.`,
    `${jobRole} for manufacturing firm. ERP systems experience required.`,
    `${jobRole} for insurance company. Policy management systems.`,
    `${jobRole} for telecom provider. Network management experience.`,
    `${jobRole} for energy sector. SCADA systems experience.`,
    `${jobRole} for education tech. Learning management systems.`
  ];

  const titles = [
    `${jobRole} - C2C Only`,
    `Senior ${jobRole} - Prime Vendor`,
    `${jobRole} - W2/C2C`,
    `${jobRole} - Immediate Start`,
    `${jobRole} - Financial Services`,
    `${jobRole} - Healthcare Project`,
    `${jobRole} - Remote Opportunity`,
    `${jobRole} - Government Project`,
    `${jobRole} - E-commerce Platform`,
    `${jobRole} - Startup Environment`,
    `${jobRole} - Data Analytics`,
    `${jobRole} - Cybersecurity`,
    `${jobRole} - Cloud Migration`,
    `${jobRole} - DevOps Team`,
    `${jobRole} - AI/ML Project`,
    `${jobRole} - Enterprise Client`,
    `${jobRole} - Prime Vendor Role`,
    `${jobRole} - Retail Chain`,
    `${jobRole} - Logistics Company`,
    `${jobRole} - Manufacturing Firm`,
    `${jobRole} - Insurance Company`,
    `${jobRole} - Telecom Provider`,
    `${jobRole} - Energy Sector`,
    `${jobRole} - Education Tech`,
    // Titles without C2C/visa mentions
    `${jobRole} - Immediate Start`,
    `Senior ${jobRole} - Long-term Project`,
    `${jobRole} - Remote Work`,
    `${jobRole} - Client Interview`,
    `${jobRole} - Financial Services`,
    `${jobRole} - Healthcare Project`,
    `${jobRole} - Remote Opportunity`,
    `${jobRole} - Government Project`,
    `${jobRole} - E-commerce Platform`,
    `${jobRole} - Startup Environment`,
    `${jobRole} - Data Analytics`,
    `${jobRole} - Cybersecurity`,
    `${jobRole} - Cloud Migration`,
    `${jobRole} - DevOps Team`,
    `${jobRole} - AI/ML Project`,
    `${jobRole} - Enterprise Client`,
    `${jobRole} - Prime Vendor Role`,
    `${jobRole} - Retail Chain`,
    `${jobRole} - Logistics Company`,
    `${jobRole} - Manufacturing Firm`,
    `${jobRole} - Insurance Company`,
    `${jobRole} - Telecom Provider`,
    `${jobRole} - Energy Sector`,
    `${jobRole} - Education Tech`
  ];

  for (let i = 0; i < 48; i++) {
    const jobTime = new Date(now.getTime() - timeOffsets[i % 24] * 60 * 1000);
    const postedDate = jobTime.toISOString().split('T')[0];
    
    // Use AI analysis to determine employment type and visa status
    const analysis = analyzeJobDescription(descriptions[i]);
    
    jobs.push({
      title: titles[i],
      company: companies[i % 24].name,
      location: companies[i % 24].location,
      visaStatus: analysis.visaStatus,
      employmentType: analysis.employmentType,
      postedDate: postedDate,
      source: 'Sample Data',
      email: `recruiter@${companies[i % 24].name.toLowerCase().replace(/\s+/g, '')}.com`,
      phone: `+1-555-${String(100 + i * 111).padStart(3, '0')}-${String(1000 + i * 1111).padStart(4, '0')}`,
      description: descriptions[i],
      hasContactInfo: true,
      skills: analysis.skills
    });
  }

  return jobs;
}

module.exports = {
  searchJobs,
  extractEmail,
  extractPhone,
  isC2C,
  hasVisaRequirement,
  getVisaStatus
};
