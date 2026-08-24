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

    const searchUrl = `https://www.indeed.com/jobs?q=${encodeURIComponent(jobRole + ' c2c')}&fromage=1`;
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

async function searchJobs(jobRole) {
  console.log(`Starting job search for: ${jobRole}`);
  
  const allJobs = [];
  
  try {
    // Scrape LinkedIn with improved headers and delays
    console.log('Scraping LinkedIn...');
    const linkedinJobs = await scrapeLinkedIn(jobRole);
    allJobs.push(...linkedinJobs);
    console.log(`Found ${linkedinJobs.length} jobs on LinkedIn`);
  } catch (error) {
    console.error('LinkedIn scraping failed:', error.message);
  }
  
  try {
    // Scrape Indeed with improved headers and delays
    console.log('Scraping Indeed...');
    const indeedJobs = await scrapeIndeed(jobRole);
    allJobs.push(...indeedJobs);
    console.log(`Found ${indeedJobs.length} jobs on Indeed`);
  } catch (error) {
    console.error('Indeed scraping failed:', error.message);
  }
  
  try {
    // Scrape Dice with improved headers and delays
    console.log('Scraping Dice...');
    const diceJobs = await scrapeDice(jobRole);
    allJobs.push(...diceJobs);
    console.log(`Found ${diceJobs.length} jobs on Dice`);
  } catch (error) {
    console.error('Dice scraping failed:', error.message);
  }
  
  // Only use sample data if absolutely no jobs found and all scrapers failed
  if (allJobs.length === 0) {
    console.log('No jobs found from any scraper, providing sample data');
    allJobs.push(...getSampleJobs(jobRole));
  }
  
  console.log(`Total jobs found: ${allJobs.length}`);
  
  return allJobs;
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
    `${jobRole} for education tech. C2C, Green Card. Learning management systems.`
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
    `${jobRole} - Education Tech`
  ];

  for (let i = 0; i < 24; i++) {
    const jobTime = new Date(now.getTime() - timeOffsets[i] * 60 * 1000);
    const postedDate = jobTime.toISOString().split('T')[0];
    
    jobs.push({
      title: titles[i],
      company: companies[i].name,
      location: companies[i].location,
      visaStatus: companies[i].visa,
      employmentType: 'C2C',
      postedDate: postedDate,
      source: 'Sample Data',
      email: `recruiter@${companies[i].name.toLowerCase().replace(/\s+/g, '')}.com`,
      phone: `+1-555-${String(100 + i * 111).padStart(3, '0')}-${String(1000 + i * 1111).padStart(4, '0')}`,
      description: descriptions[i]
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
