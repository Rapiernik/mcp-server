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

const server = new McpServer({
    name: "company-info-server",
    version: "0.1.0",
});

process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
});

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

        // Create a single-item array with the URL
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
        // First check the progress
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

        // If not ready, return progress status
        if (progressResponse.data.status !== 'ready') {
            return {
                status: progressResponse.data.status || 'processing',
                message: 'LinkedIn posts collection is still in progress',
                progress: progressResponse.data,
                snapshot_id: snapshotId,
                next_step: "Please check again in a few moments"
            };
        }

        // If ready, fetch the data
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

        // Process and format the posts data
        const postsData = Array.isArray(snapshotResponse.data)
            ? snapshotResponse.data
            : [snapshotResponse.data];

        // Group posts by company if multiple companies in response
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

        // Convert to array format
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

console.error('[Setup] Initializing Company Information MCP server...');
const transport = new StdioServerTransport();
server.connect(transport);
console.error('Company Information MCP server running on stdio');