#!/usr/bin/env node
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {z} from "zod";
import axios from 'axios';

const ANY_MAIL_API_KEY = process.env.ANY_MAIL_API_KEY;
const BRIGHT_DATA_BEARER_TOKEN = process.env.BRIGHT_DATA_BEARER_TOKEN;

const BRIGHT_DATA_URL = 'https://api.brightdata.com/datasets/v3/trigger';
const COMPANIES_DATASET_ID = 'gd_l1vikfnt1wgvvqz95w';
const COMPANY_POSTS_DATASET_ID = 'gd_lyy3tktm25m4avu764';
const JOB_POSTINGS_DATASET_ID = 'gd_lpfll7v5hcqtkxl6l';

const server = new McpServer({
    name: "company-info-server",
    version: "0.1.0",
});

process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
});

server.tool(
    "get_company_job_postings",
    {
        snapshot_id: z.string().describe('The snapshot ID returned from initiate_company_job_postings_collection')
    },
    async ({snapshot_id}) => {
        console.error(`[API] Checking job search results for snapshot ID: ${snapshot_id}`);

        const result = await getCompanyJobPostings(snapshot_id);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    }
);

server.tool(
    "initiate_company_job_postings_collection",
    {
        location: z.enum(['The Netherlands', 'Belgium']).describe('Location to search for jobs'),
        country: z.enum(['NL', 'BE']).describe('Country code for the location'),
        time_range: z.enum(['Past 24 hours', 'Past week', 'Past month', 'Any time']).describe('How recent the job postings should be'),
        company: z.string().describe('Specific company to search for jobs at')
    },
    async (params) => {
        console.error(`[API] Initiating job search with parameters: ${JSON.stringify(params)}`);

        const searchParams = {
            location: params.location,
            country: params.country,
            time_range: params.time_range,
            company: params.company
        }

        const snapshotId = await initiateCompanyJobPostingsCollection(searchParams);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        message: "Job search has been initiated successfully",
                        search_params: searchParams,
                        snapshot_id: snapshotId,
                        status: "processing",
                        next_step: "Use the get_job_search_results tool with this snapshot_id to retrieve results",
                        estimated_time: "This process typically takes 2-5 minutes"
                    }, null, 2),
                },
            ],
        };
    }
);

server.tool(
    "initiate_company_posts_collection",
    {
        url: z.string().describe('LinkedIn company URL (e.g., "https://www.linkedin.com/company/eneco")')
    },
    async ({url}) => {
        console.error(`[API] Initiating LinkedIn posts collection for company: ${url}`);

        if (!url || !url.includes('linkedin.com/company/')) {
            throw new Error('You must provide a valid LinkedIn company URL');
        }

        const companyUrl = [{url}];
        const snapshotId = await initiateCompanyPostsCollection(companyUrl);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        message: "LinkedIn posts collection has been initiated successfully",
                        company_url: url,
                        snapshot_id: snapshotId,
                        status: "processing",
                        next_step: "Use the get_company_posts tool with this snapshot_id to retrieve results",
                        estimated_time: "This process typically takes 2-6 minutes"
                    }, null, 2),
                },
            ],
        };
    }
);

server.tool(
    "get_company_posts",
    {
        snapshot_id: z.string().describe('The snapshot ID returned from initiate_company_posts_collection')
    },
    async ({snapshot_id}) => {
        console.error(`[API] Checking LinkedIn posts for snapshot ID: ${snapshot_id}`);

        const result = await getCompanyPosts(snapshot_id);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    }
);

server.tool(
    "initiate_companies_data_collection",
    {
        urls: z.array(z.string().describe('LinkedIn company URL (e.g., "https://www.linkedin.com/company/eneco")')).describe('An array of LinkedIn company URLs to fetch information for')
    },
    async ({urls}) => {
        console.error(`[API] Initiating data collection for ${urls.length} companies`);

        if (urls.length === 0) {
            throw new Error('You must provide at least one company URL');
        }

        const companyUrls = urls.map(url => ({url}));
        const snapshotId = await initiateCompaniesDataCollection(companyUrls);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        message: "Data collection has been initiated successfully",
                        snapshot_id: snapshotId,
                        status: "processing",
                        next_step: "Use the get_companies_data tool with this snapshot_id to retrieve results",
                        estimated_time: "This process typically takes 1-5 minutes depending on the number of companies"
                    }, null, 2),
                },
            ],
        };
    }
);

server.tool(
    "get_companies_data",
    {
        snapshot_id: z.string().describe('The snapshot ID returned from initiate_companies_data_collection')
    },
    async ({snapshot_id}) => {
        console.error(`[API] Checking data for snapshot ID: ${snapshot_id}`);

        const result = await getCompaniesData(snapshot_id);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    }
);

server.tool(
    "get_employee_work_email",
    {
        domain: z.string().describe('Company domain (e.g., "example.com")'),
        firstName: z.string().describe('First name of the employee'),
        lastName: z.string().describe('Last name of the employee'),
        companyName: z.string().describe('Company name'),
    },
    async ({domain, firstName, lastName, companyName}) => {
        console.error(`[API] Finding work email for employee at domain: ${domain}`);

        const emailResult = await fetchEmployeeEmail({
            domain,
            firstName,
            lastName,
            companyName
        });

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(emailResult, null, 2),
                },
            ],
        };
    }
);

async function initiateCompaniesDataCollection(companyUrls: { url: string }[]): Promise<string> {
    if (!BRIGHT_DATA_BEARER_TOKEN) {
        throw new Error('Missing Bright Data Bearer Token');
    }

    try {
        console.error(`[API] Triggering Bright Data dataset collection for ${companyUrls.length} companies`);

        const triggerResponse = await axios.post(
            `${BRIGHT_DATA_URL}?dataset_id=${COMPANIES_DATASET_ID}&include_errors=true`,
            companyUrls,
            {
                headers: {
                    'Authorization': `Bearer ${BRIGHT_DATA_BEARER_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!triggerResponse.data || !triggerResponse.data.snapshot_id) {
            throw new Error('Failed to trigger dataset collection: Invalid response');
        }

        return triggerResponse.data.snapshot_id;
    } catch (error: any) {
        console.error('[API] Error initiating companies data collection:', error);
        throw new Error(`Error initiating data collection: ${error.message}`);
    }
}

async function getCompaniesData(snapshotId: string) {
    if (!BRIGHT_DATA_BEARER_TOKEN) {
        throw new Error('Missing Bright Data Bearer Token');
    }

    try {
        const progressResponse = await axios.get(
            `https://api.brightdata.com/datasets/v3/progress/${snapshotId}`,
            {
                headers: {
                    'Authorization': `Bearer ${BRIGHT_DATA_BEARER_TOKEN}`
                }
            }
        );

        if (!progressResponse.data) {
            throw new Error('Failed to check dataset progress: Empty response');
        }

        if (progressResponse.data.status !== 'ready') {
            return {
                status: progressResponse.data.status || 'processing',
                message: 'Data collection is still in progress',
                progress: progressResponse.data,
                snapshot_id: snapshotId,
                next_step: "Please check again in a few moments"
            };
        }

        console.error(`[API] Fetching dataset snapshot data...`);
        const snapshotResponse = await axios.get(
            `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
            {
                headers: {
                    'Authorization': `Bearer ${BRIGHT_DATA_BEARER_TOKEN}`
                }
            }
        );

        if (!snapshotResponse.data) {
            throw new Error('Failed to fetch dataset snapshot: Empty response');
        }

        const companiesData = Array.isArray(snapshotResponse.data) ? snapshotResponse.data : [snapshotResponse.data];

        const formattedCompaniesInfo = companiesData.map(company => ({
            url: company.url || null,
            name: company.name || null,
            industry: company.industries || company.industry || null,
            description: company.about || null,
            website: company.website || null,
            headquarters: company.headquarters || null,
            foundedYear: company.founded || null,
            companySize: company.company_size || null,
            specialties: company.specialties || null,
            followers: company.followers || null,
            companyId: company.company_id || null,
            organizationType: company.organization_type || null,
            locations: company.locations || company.formatted_locations || null,
            employees: {
                count: company.employees_in_linkedin || null,
                profiles: company.employees || []
            },
            updates: (company.updates || []).slice(0, 3).map((update: any) => ({
                text: update.text || null,
                likes: update.likes_count || 0,
                comments: update.comments_count || 0,
                date: update.date || update.time || null,
                postUrl: update.post_url || null,
                images: update.images || []
            })),
            similar: company.similar || [],
            affiliated: company.affiliated || [],
            logo: company.logo || null,
            timestamp: new Date().toISOString()
        }));

        return {
            status: 'ready',
            message: 'Data collection completed successfully',
            companies: formattedCompaniesInfo,
            count: formattedCompaniesInfo.length,
            snapshot_id: snapshotId,
            timestamp: new Date().toISOString()
        };
    } catch (error: any) {
        console.error('[API] Error retrieving companies data:', error);
        throw new Error(`Error retrieving companies data: ${error.message}`);
    }
}

async function fetchEmployeeEmail(args: {
    domain: string;
    firstName: string;
    lastName: string;
    companyName: string;
}) {
    const {domain, firstName, lastName, companyName} = args;

    try {
        let requestBody = {
            domain,
            first_name: firstName,
            last_name: lastName,
            full_name: `${firstName} ${lastName}`,
            company: companyName
        };

        console.error(`[API] Making request to AnymailFinder for: ${JSON.stringify(requestBody)}`);

        const url = "https://api.anymailfinder.com/v5.0/search/person.json";

        if (!ANY_MAIL_API_KEY) {
            throw new Error('Missing AnymailFinder API key');
        }

        const response = await axios.post(url, requestBody, {
            headers: {
                "Authorization": `Bearer ${ANY_MAIL_API_KEY}`,
                "Content-Type": "application/json",
            },
            validateStatus: (status) => status >= 200 && status < 500,
        });

        console.error(`[API] Received response with status: ${response.status}`);
        console.error('[API] Response data:', response.data);

        const data = response.data;

        if (response.status === 200 && data.success) {
            return {
                email: data.results.email,
                valid: data.results.validation === "valid",
                success: data.success,
                timestamp: new Date().toISOString()
            };
        } else if (response.status === 404 || response.status === 451) {
            return {
                message: "Email not found",
                timestamp: new Date().toISOString()
            };
        } else if (response.status === 400 || response.status === 401) {
            throw new Error(`Invalid request: ${data.error_explained || 'Authentication error'}`);
        } else if (response.status === 402) {
            throw new Error(`Insufficient credits: ${data.error_explained || 'Account has insufficient credits'}`);
        } else {
            throw new Error(`Unknown error: ${response.status} ${response.statusText}`);
        }
    } catch (error: any) {
        console.error('[API] Error fetching employee email:', error);
        throw new Error(`Error fetching employee email: ${error.message}`);
    }
}

async function initiateCompanyPostsCollection(companyUrl: { url: string }[]): Promise<string> {
    if (!BRIGHT_DATA_BEARER_TOKEN) {
        throw new Error('Missing Bright Data Bearer Token');
    }

    try {
        console.error(`[API] Triggering Bright Data dataset collection for company posts: ${companyUrl[0].url}`);

        const triggerResponse = await axios.post(
            `${BRIGHT_DATA_URL}?dataset_id=${COMPANY_POSTS_DATASET_ID}&include_errors=true&type=discover_new&discover_by=company_url`,
            companyUrl,
            {
                headers: {
                    'Authorization': `Bearer ${BRIGHT_DATA_BEARER_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!triggerResponse.data || !triggerResponse.data.snapshot_id) {
            throw new Error('Failed to trigger LinkedIn posts collection: Invalid response');
        }

        return triggerResponse.data.snapshot_id;
    } catch (error: any) {
        console.error('[API] Error initiating LinkedIn posts collection:', error);
        throw new Error(`Error initiating LinkedIn posts collection: ${error.message}`);
    }
}

async function getCompanyPosts(snapshotId: string) {
    if (!BRIGHT_DATA_BEARER_TOKEN) {
        throw new Error('Missing Bright Data Bearer Token');
    }

    try {
        const progressResponse = await axios.get(
            `https://api.brightdata.com/datasets/v3/progress/${snapshotId}`,
            {
                headers: {
                    'Authorization': `Bearer ${BRIGHT_DATA_BEARER_TOKEN}`
                }
            }
        );

        if (!progressResponse.data) {
            throw new Error('Failed to check dataset progress: Empty response');
        }

        if (progressResponse.data.status !== 'ready') {
            return {
                status: progressResponse.data.status || 'processing',
                message: 'LinkedIn posts collection is still in progress',
                progress: progressResponse.data,
                snapshot_id: snapshotId,
                next_step: "Please check again in a few moments"
            };
        }

        console.error(`[API] Fetching LinkedIn posts snapshot data...`);
        const snapshotResponse = await axios.get(
            `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
            {
                headers: {
                    'Authorization': `Bearer ${BRIGHT_DATA_BEARER_TOKEN}`
                }
            }
        );

        if (!snapshotResponse.data) {
            throw new Error('Failed to fetch LinkedIn posts snapshot: Empty response');
        }

        const postsData = Array.isArray(snapshotResponse.data)
            ? snapshotResponse.data
            : [snapshotResponse.data];

        const groupedByCompany = postsData.reduce((acc, post) => {
            const companyId = post.user_id || post.discovery_input?.url?.match(/company\/([^\/]+)/)?.[1] || 'unknown';

            if (!acc[companyId]) {
                acc[companyId] = {
                    company: {
                        id: companyId,
                        name: post.title?.split('|')?.[1]?.trim() || companyId,
                        url: post.use_url || post.discovery_input?.url || null,
                        followers: post.user_followers || 0,
                        profilePicture: post.author_profile_pic || null
                    },
                    posts: []
                };
            }

            acc[companyId].posts.push({
                id: post.id,
                url: post.url,
                text: post.post_text,
                htmlText: post.post_text_html,
                datePosted: post.date_posted,
                comments: post.num_comments,
            });

            return acc;
        }, {});

        const formattedCompanyPosts = Object.values(groupedByCompany).map((company: any) => ({
            company: company.company,
            posts: company.posts,
            postsCount: company.posts.length,
            timestamp: new Date().toISOString()
        }));

        return {
            status: 'ready',
            message: 'LinkedIn posts collection completed successfully',
            companyPosts: formattedCompanyPosts,
            companiesCount: formattedCompanyPosts.length,
            totalPostsCount: formattedCompanyPosts.reduce((total: number, company: any) => total + company.postsCount, 0),
            snapshot_id: snapshotId,
            timestamp: new Date().toISOString()
        };
    } catch (error: any) {
        console.error('[API] Error retrieving LinkedIn company posts:', error);
        throw new Error(`Error retrieving LinkedIn company posts: ${error.message}`);
    }
}

function isTechnicalJob(jobTitle: string) {
    const techKeywords = [
        'engineer',
        'ingénieur',
        'developer',
        'développeur',
        'architect',
        'architecte',
        'machine learning',
        'apprentissage automatique',
        'kunstmatige intelligentie',
        'intelligence artificielle',
        'backend',
        'back end',
        'arrière-plan',
        'front end',
        'frontend',
        'interface utilisateur',
        'full stack',
        'fullstack',
        'pile complète',
        'software',
        'logiciel',
        'logiciel développeur',
        'softwareontwikkelaar',
        'développeur de logiciels',
        'data scientist',
        'scientifique des données',
        'datawetenschapper',
        'ml',
        'apprentissage automatique',
        'ai engineer',
        'ingénieur en intelligence artificielle',
        'artificial intelligence',
        'intelligence artificielle',
        'cloud',
        'nuage',
        'informatique en nuage',
        'devops',
        'security engineer',
        'ingénieur en sécurité',
        'beveiligingsingenieur',
        'embedded',
        'embarqué',
        'systems engineer',
        'ingénieur en systèmes',
        'systeemingenieur',
        'ingénieur système',
        'robotics',
        'robotique',
        'robotica',
        'computer vision',
        'vision par ordinateur',
        'computervisie',
        'aws',
        'amazon web services',
        'azure',
        'gcp',
        'google cloud',
        'cloud architect',
        'architecte cloud',
        'cloud ingenieur',
        'ingénieur cloud',
        'cloud engineer',
        'cloud security',
        'sécurité du cloud',
        'cloudbeveiliging',
        'kubernetes',
        'docker',
        'serverless',
        'sans serveur',
        'python',
    ];

    const lowerCaseTitle = jobTitle.toLowerCase();
    const matches = techKeywords.filter(keyword => lowerCaseTitle.includes(keyword));
    return matches.length > 0;
}

async function getCompanyJobPostings(snapshotId: string) {
    if (!BRIGHT_DATA_BEARER_TOKEN) {
        throw new Error('Missing Bright Data Bearer Token');
    }

    try {
        const progressResponse = await axios.get(
            `https://api.brightdata.com/datasets/v3/progress/${snapshotId}`,
            {
                headers: {
                    'Authorization': `Bearer ${BRIGHT_DATA_BEARER_TOKEN}`
                }
            }
        );

        if (!progressResponse.data) {
            throw new Error('Failed to check dataset progress: Empty response');
        }

        if (progressResponse.data.status !== 'ready') {
            return {
                status: progressResponse.data.status || 'processing',
                message: 'Get company job postings is still in progress',
                progress: progressResponse.data,
                snapshot_id: snapshotId,
                next_step: "Please check again in a few moments"
            };
        }

        console.error(`[API] Fetching job postings results...`);
        const snapshotResponse = await axios.get(
            `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
            {
                headers: {
                    'Authorization': `Bearer ${BRIGHT_DATA_BEARER_TOKEN}`
                }
            }
        );

        if (!snapshotResponse.data) {
            throw new Error('Failed to fetch job postings results: Empty response');
        }

        const jobsData = Array.isArray(snapshotResponse.data)
            ? snapshotResponse.data
            : [snapshotResponse.data];

        const allFormattedJobs = jobsData.map(job => {
            return {
                id: job.job_posting_id,
                title: job.job_title,
                company: {
                    name: job.company_name,
                    id: job.company_id,
                    url: job.company_url,
                },
                location: job.job_location,
                country: job.country_code,
                url: job.url,
                posted: {
                    date: job.job_posted_date,
                    relativeTime: job.job_posted_time
                },
                applicants: job.job_num_applicants,
                description: {
                    summary: job.job_summary,
                    formatted: job.job_description_formatted
                },
                isTechnical: isTechnicalJob(job.job_title || '')
            };
        });

        const technicalJobs = allFormattedJobs.filter(job => job.isTechnical);
        const searchParams = jobsData[0]?.discovery_input || {};

        return {
            status: 'ready',
            message: 'Get company job postings completed successfully',
            jobs: technicalJobs,
            jobCount: technicalJobs.length,
            searchParameters: {
                location: searchParams.location,
                country: searchParams.country,
                timeRange: searchParams.time_range,
                company: searchParams.company
            },
            snapshot_id: snapshotId,
            timestamp: new Date().toISOString()
        };
    } catch (error: any) {
        console.error('[API] Error retrieving job postings results:', error);
        throw new Error(`Error retrieving job postings results: ${error.message}`);
    }
}

async function initiateCompanyJobPostingsCollection(searchParams: {
    location: string,
    country: string,
    time_range: string,
    company: string
}): Promise<string> {
    if (!BRIGHT_DATA_BEARER_TOKEN) {
        throw new Error('Missing Bright Data Bearer Token');
    }

    try {
        console.error(`[API] Triggering Bright Data dataset collection for job search: ${JSON.stringify(searchParams)}`);

        const payload = [{
            keyword: '',
            location: searchParams.location,
            country: searchParams.country,
            time_range: searchParams.time_range,
            job_type: '',
            experience_level: '',
            remote: '',
            company: searchParams.company
        }]

        const triggerResponse = await axios.post(
            `${BRIGHT_DATA_URL}?dataset_id=${JOB_POSTINGS_DATASET_ID}&include_errors=true&type=discover_new&discover_by=keyword`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${BRIGHT_DATA_BEARER_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!triggerResponse.data || !triggerResponse.data.snapshot_id) {
            throw new Error('Failed to trigger job search: Invalid response');
        }

        return triggerResponse.data.snapshot_id;
    } catch (error: any) {
        console.error('[API] Error initiating job search:', error);
        throw new Error(`Error initiating job search: ${error.message}`);
    }
}

console.error('[Setup] Initializing Company Information MCP server...');
const transport = new StdioServerTransport();
server.connect(transport);
console.error('Company Information MCP server running on stdio');