#!/usr/bin/env node
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError,} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

const ANY_MAIL_API_KEY = process.env.ANY_MAIL_API_KEY;
const BRIGHT_DATA_BEARER_TOKEN = process.env.BRIGHT_DATA_BEARER_TOKEN;

class CompanyInfoServer {
    private server: Server;
    private readonly brightDataUrl: string = 'https://api.brightdata.com/datasets/v3/trigger';
    private readonly getCompaniesBrightDataDatasetId: string = 'gd_l1vikfnt1wgvvqz95w';

    constructor() {
        console.error('[Setup] Initializing Company Information MCP server...');

        this.server = new Server(
            {
                name: 'company-info-server',
                version: '0.1.0',
            },
            {
                capabilities: {
                    tools: {},
                    timeout: 600000,
                },
            }
        );

        this.setupToolHandlers();

        this.server.onerror = (error) => console.error('[Error]', error);
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'get_companies_information',
                    description: 'Fetch information for multiple companies',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            urls: {
                                type: 'array',
                                items: {
                                    type: 'string',
                                    description: 'LinkedIn company URL (e.g., "https://www.linkedin.com/company/eneco")',
                                },
                                description: 'An array of LinkedIn company URLs to fetch information for',
                            }
                        },
                        required: ['urls'],
                        description: 'Input for retrieving information about multiple companies using LinkedIn URLs',
                    },
                },
                {
                    name: 'get_employee_work_email',
                    description: 'Find work email address for an employee at a specific company',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            domain: {
                                type: 'string',
                                description: 'Company domain (e.g., "example.com")',
                            },
                            firstName: {
                                type: 'string',
                                description: 'First name of the employee',
                            },
                            lastName: {
                                type: 'string',
                                description: 'Last name of the employee',
                            },
                            companyName: {
                                type: 'string',
                                description: 'Company name',
                            },
                        },
                        required: ['domain', 'firstName', 'lastName', 'companyName'],
                    },
                },
            ],
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                const toolName = request.params.name;

                if (toolName === 'get_companies_information') {
                    // Get the arguments passed to the tool
                    const args = request.params.arguments;

                    console.error('[Debug] Arguments received:', JSON.stringify(args));

                    // Check if args is an object with a urls property
                    if (!args || typeof args !== 'object' || !('urls' in args)) {
                        throw new McpError(
                            ErrorCode.InvalidParams,
                            'Input must be an object with a "urls" property'
                        );
                    }

                    const urls = args.urls;

                    // Validate that urls is an array
                    if (!Array.isArray(urls)) {
                        throw new McpError(
                            ErrorCode.InvalidParams,
                            'The "urls" property must be an array'
                        );
                    }

                    // Validate that the array is not empty
                    if (urls.length === 0) {
                        throw new McpError(
                            ErrorCode.InvalidParams,
                            'You must provide at least one company URL'
                        );
                    }

                    // Validate each item in the array is a string
                    const companyUrls = urls.map((url: any) => {
                        if (typeof url !== 'string') {
                            throw new McpError(
                                ErrorCode.InvalidParams,
                                'Each item in the "urls" array must be a string URL'
                            );
                        }
                        return {url: url};
                    });

                    console.error(`[API] Fetching information for ${companyUrls.length} companies`);

                    const companiesInfo = await this.fetchCompaniesInformation(companyUrls);

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(companiesInfo, null, 2),
                            },
                        ],
                    };
                } else if (toolName === 'get_employee_work_email') {
                    const args = request.params.arguments as {
                        domain: string;
                        firstName: string;
                        lastName: string;
                        companyName: string;
                    };

                    if (!args.domain) {
                        throw new McpError(
                            ErrorCode.InvalidParams,
                            'Missing required parameter: domain'
                        );
                    }

                    if (!args.firstName || !args.lastName) {
                        throw new McpError(
                            ErrorCode.InvalidParams,
                            'You must provide either firstName and lastName'
                        );
                    }

                    console.error(`[API] Finding work email for employee at domain: ${args.domain}`);

                    const emailResult = await this.fetchEmployeeEmail(args);

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(emailResult, null, 2),
                            },
                        ],
                    };
                } else {
                    throw new McpError(
                        ErrorCode.MethodNotFound,
                        `Unknown tool: ${toolName}`
                    );
                }
            } catch (error: unknown) {
                if (error instanceof Error) {
                    console.error('[Error] Failed to process request:', error);
                    throw new McpError(
                        ErrorCode.InternalError,
                        `Failed to process request: ${error.message}`
                    );
                }
                throw error;
            }
        });
    }

    private async fetchCompaniesInformation(companyUrls: { url: string }[]) {
        if (!BRIGHT_DATA_BEARER_TOKEN) {
            throw new McpError(
                ErrorCode.InternalError,
                'Missing Bright Data Bearer Token'
            );
        }

        try {
            console.error(`[API] Triggering Bright Data dataset collection for ${companyUrls.length} companies`);

            const triggerResponse = await axios.post(
                `${this.brightDataUrl}?dataset_id=${this.getCompaniesBrightDataDatasetId}&include_errors=true`,
                companyUrls,
                {
                    headers: {
                        'Authorization': `Bearer ${BRIGHT_DATA_BEARER_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!triggerResponse.data || !triggerResponse.data.snapshot_id) {
                throw new McpError(
                    ErrorCode.InternalError,
                    'Failed to trigger dataset collection: Invalid response'
                );
            }

            const snapshotId = triggerResponse.data.snapshot_id;
            console.error(`[API] Dataset collection triggered with snapshot ID: ${snapshotId}`);

            // Step 2: Poll the progress endpoint until status is ready
            let isReady = false;
            let attempts = 0;
            const maxAttempts = 30; // Maximum number of polling attempts
            const pollInterval = 10000; // Poll every 5 seconds

            while (!isReady && attempts < maxAttempts) {
                attempts++;

                await new Promise(resolve => setTimeout(resolve, pollInterval));

                console.error(`[API] Checking dataset progress (attempt ${attempts}/${maxAttempts})...`);

                const progressResponse = await axios.get(
                    `https://api.brightdata.com/datasets/v3/progress/${snapshotId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${BRIGHT_DATA_BEARER_TOKEN}`
                        }
                    }
                );

                if (progressResponse.data && progressResponse.data.status === 'ready') {
                    isReady = true;
                    console.error(`[API] Dataset collection completed with ${progressResponse.data.records} records and ${progressResponse.data.errors} errors`);
                } else if (progressResponse.data && progressResponse.data.status === 'error') {
                    throw new McpError(
                        ErrorCode.InternalError,
                        `Dataset collection failed: ${JSON.stringify(progressResponse.data)}`
                    );
                } else {
                    console.error(`[API] Dataset collection in progress... (${progressResponse.data?.status || 'unknown status'})`);
                }
            }

            if (!isReady) {
                throw new McpError(
                    ErrorCode.InternalError,
                    'Dataset collection timed out after maximum attempts'
                );
            }

            // Step 3: Fetch the data from the snapshot
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
                throw new McpError(
                    ErrorCode.InternalError,
                    'Failed to fetch dataset snapshot: Empty response'
                );
            }

            // Process and format the companies data
            const companiesData = Array.isArray(snapshotResponse.data) ? snapshotResponse.data : [snapshotResponse.data];

            // Format the companies information based on the actual response structure
            const formattedCompaniesInfo = companiesData.map(company => {
                return {
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
                };
            });

            return formattedCompaniesInfo;
        } catch (error: any) {
            console.error('[API] Error fetching companies information:', error);

            if (error instanceof McpError) {
                throw error;
            }

            if (error.response) {
                throw new McpError(
                    ErrorCode.InternalError,
                    `Request failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`
                );
            } else if (error.request) {
                throw new McpError(
                    ErrorCode.InternalError,
                    `No response received: ${error.message}`
                );
            } else {
                throw new McpError(
                    ErrorCode.InternalError,
                    `Error setting up request: ${error.message}`
                );
            }
        }
    }

    private generateLinkedInId(companyName: string): string {
        const knownCompanyIds: { [key: string]: string } = {
            'rtl nederland': 'rtl-nederland',
            'rtl': 'rtl-nederland',
            'npo': 'npo',
            'nederlandse publieke omroep': 'npo',
            'dpg media': 'dpg-media',
            'dpg': 'dpg-media',
            'talpa': 'talpanetwork',
            'talpa network': 'talpanetwork',
            'shell': 'shell',
            'essent': 'essent',
            'vattenfall': 'vattenfall',
            'eneco': 'eneco',
            'kpn': 'kpn',
            'ing': 'ing',
            'ing group': 'ing',
            'abn amro': 'abnamro',
            'abn': 'abnamro',
            'rabobank': 'rabobank',
            'philips': 'philips',
            'heineken': 'heineken',
            'unilever': 'unilever',
            'asml': 'asml',
            'kpmg': 'kpmg',
            'pwc': 'pwc',
            'deloitte': 'deloitte',
            'ey': 'ey',
            'tata steel': 'tata-steel-europe',
            'bol.com': 'bol-com',
            'bol': 'bol-com',
            'ibm': 'ibm',
            'microsoft': 'microsoft',
            'google': 'google',
            'amazon': 'amazon',
            'booking.com': 'booking-com',
            'booking': 'booking-com',
        };

        const lowerName = companyName.toLowerCase();
        for (const [key, value] of Object.entries(knownCompanyIds)) {
            if (lowerName.includes(key)) {
                return value;
            }
        }

        return companyName
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim();
    }

    private isTechnicalJob(jobTitle: string) {
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

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Company Information MCP server running on stdio');
    }

    private async fetchEmployeeEmail(args: {
        domain: string;
        firstName: string;
        lastName: string;
        companyName: string;
    }) {
        const {domain, firstName, lastName, companyName} = args;

        try {
            let requestBody: any = {domain};

            requestBody.first_name = firstName;
            requestBody.last_name = lastName;
            requestBody.full_name = `${firstName} ${lastName}`;
            requestBody.company = companyName;

            console.error(`[API] Making request to AnymailFinder for: ${JSON.stringify(requestBody)}`);

            const url = "https://api.anymailfinder.com/v5.0/search/person.json";

            if (!ANY_MAIL_API_KEY) {
                throw new McpError(
                    ErrorCode.InternalError,
                    'Missing AnymailFinder API key'
                );
            }
            const response = await axios.post(url, requestBody, {
                headers: {
                    "Authorization": `Bearer ${ANY_MAIL_API_KEY}`,
                    "Content-Type": "application/json",
                },
                validateStatus: (status) => status >= 200 && status < 500,
            });

            console.error(`[API] Received response with status: ${response.status}`);

            const data = response.data;

            console.error('[API] Response data:', data);

            if (response.status === 200 && data.success) {
                return {
                    email: data.results.email,
                    valid: data.results.validation === "valid",
                    success: data.success,
                    timestamp: new Date().toISOString()
                };
            } else if (response.status === 400 || response.status === 401) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Invalid request: ${data.error_explained || 'Authentication error'}`
                );
            } else if (response.status === 402) {
                throw new McpError(
                    ErrorCode.InternalError,
                    `Insufficient credits: ${data.error_explained || 'Account has insufficient credits'}`
                );
            } else if (response.status === 404 || response.status === 451) {
                return {
                    message: "Email not found",
                    timestamp: new Date().toISOString()
                };
            } else {
                throw new McpError(
                    ErrorCode.InternalError,
                    `Unknown error: ${response.status} ${response.statusText}`
                );
            }
        } catch (error: any) {
            console.error('[API] Error fetching employee email:', error);

            if (error instanceof McpError) {
                throw error;
            }

            if (error.response) {
                throw new McpError(
                    ErrorCode.InternalError,
                    `Request failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`
                );
            } else if (error.request) {
                throw new McpError(
                    ErrorCode.InternalError,
                    `No response received: ${error.message}`
                );
            } else {
                throw new McpError(
                    ErrorCode.InternalError,
                    `Error setting up request: ${error.message}`
                );
            }
        }
    }
}

const server = new CompanyInfoServer();
server.run().catch(console.error);