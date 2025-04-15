#!/usr/bin/env node
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError,} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

class CompanyInfoServer {
    private server: Server;
    private readonly apiKey: string = '67fe722f3237e5533103a23b';
    private readonly scrapingdogUrl: string = 'http://api.scrapingdog.com/linkedinjobs';
    private readonly companyProfileUrl: string = 'https://api.scrapingdog.com/linkedin';

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
                    name: 'get_company_job_postings',
                    description: 'Get technical job postings for a specified company',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            company: {
                                type: 'string',
                                description: 'Company name',
                            },
                            country: {
                                type: 'string',
                                description: 'Country (Belgium or Netherlands)',
                                enum: ['Belgium', 'Netherlands']
                            },
                            companyId: {
                                type: 'string',
                                description: 'LinkedIn Company ID',
                            },
                        },
                        required: ['company', 'country', 'companyId'],
                    },
                },
                {
                    name: 'get_job_posting_details',
                    description: 'Get detailed information about a specific job posting',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            jobId: {
                                type: 'string',
                                description: 'LinkedIn Job ID',
                            },
                        },
                        required: ['jobId'],
                    },
                },
                {
                    name: 'get_company_information',
                    description: 'Get detailed profile information about a company from LinkedIn, including company details, employees, and recent updates',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            companyName: {
                                type: 'string',
                                description: 'Company name to search for',
                            },
                            linkedInId: {
                                type: 'string',
                                description: 'LinkedIn Company ID (from URL, e.g., "rtl-nederland" from "https://www.linkedin.com/company/rtl-nederland")',
                            },
                        },
                        required: ['companyName'],
                    },
                },
            ],
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                const toolName = request.params.name;

                if (toolName === 'get_company_job_postings') {
                    const args = request.params.arguments as {
                        company: string;
                        country: string;
                        companyId: string;
                    };

                    if (!args.company || !args.country || !args.companyId) {
                        throw new McpError(
                            ErrorCode.InvalidParams,
                            'Missing required parameters: company, country, or companyId'
                        );
                    }

                    console.error(`[API] Fetching job postings for company: ${args.company} in ${args.country}`);

                    const jobPostings = await this.fetchCompanyJobPostings(args.company, args.country, args.companyId);

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(jobPostings, null, 2),
                            },
                        ],
                    };
                } else if (toolName === 'get_job_posting_details') {
                    const args = request.params.arguments as {
                        jobId: string;
                    };

                    if (!args.jobId) {
                        throw new McpError(
                            ErrorCode.InvalidParams,
                            'Missing required parameter: jobId'
                        );
                    }

                    console.error(`[API] Fetching details for job ID: ${args.jobId}`);

                    const jobDetails = await this.fetchJobPostingDetails(args.jobId);

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(jobDetails, null, 2),
                            },
                        ],
                    };
                } else if (toolName === 'get_company_information') {
                    const args = request.params.arguments as {
                        companyName: string;
                        linkedInId?: string;
                    };

                    if (!args.companyName) {
                        throw new McpError(
                            ErrorCode.InvalidParams,
                            'Missing required parameter: companyName'
                        );
                    }

                    console.error(`[API] Fetching company information for: ${args.companyName}`);

                    const companyInfo = await this.fetchCompanyInformation(args.companyName, args.linkedInId);

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(companyInfo, null, 2),
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

    private async fetchCompanyJobPostings(company: string, country: string, companyId: string) {
        const countryGeoIdMap: { [key: string]: string } = {
            Belgium: '100565514',
            Netherlands: '102890719',
        };

        const geoid = countryGeoIdMap[country];
        if (!geoid) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `LinkedIn geoid not found for country: ${country}`
            );
        }

        let allData: object[] = [];
        let page = 1;

        try {
            while (true) {
                console.error(`[API] Fetching page ${page} for company ${company}`);

                try {
                    const response = await axios.get(this.scrapingdogUrl, {
                        params: {
                            api_key: this.apiKey,
                            field: company,
                            geoid,
                            page,
                            sort_by: 'month',
                            filter_by_company: companyId,
                        },
                    });

                    if (response.status === 200) {
                        const data = response.data;
                        if (!data || data.length === 0) {
                            console.error(`[API] No more data returned on page ${page}`);
                            break;
                        }

                        const filteredJobPostings = data
                            .map((job: {
                                job_id: string;
                                job_position: string;
                                job_link: string;
                                company_name: string;
                                company_profile: string;
                                job_location: string;
                                job_posting_date: string;
                            }) => ({
                                jobId: job.job_id,
                                jobPosition: job.job_position,
                                jobLink: job.job_link,
                                companyName: job.company_name,
                                companyProfile: job.company_profile,
                                jobLocation: job.job_location,
                                jobPostingDate: job.job_posting_date
                            }))
                            .filter((job: { jobPosition: string; }) => this.isTechnicalJob(job.jobPosition));

                        console.error(`[API] Found ${filteredJobPostings.length} technical jobs on page ${page}`);
                        allData = allData.concat(filteredJobPostings);
                    }
                } catch (error: any) {
                    if (error.response && error.response.status === 404) {
                        console.error(`[API] Reached the end of available data at page ${page}`);
                        console.error(`[API] Message from ScrapingDog: ${error.response.data.message}`);
                        break;
                    } else {
                        throw error;
                    }
                }
                page++;
            }

            return {
                company,
                country,
                filteredJobPostings: allData,
                totalCount: allData.length,
                timestamp: new Date().toISOString()
            };
        } catch (error: any) {
            console.error('[API] Error fetching job postings:', error);
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to fetch job postings: ${error.message}`
            );
        }
    }

    private async fetchJobPostingDetails(jobId: string) {
        try {
            console.error(`[API] Fetching details for job ID: ${jobId}`);

            const response = await axios.get(this.scrapingdogUrl, {
                params: {
                    api_key: this.apiKey,
                    job_id: jobId,
                },
            });

            if (response.status === 200) {
                const data = response.data;
                if (!data || data.length === 0) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `No details found for job ID: ${jobId}`
                    );
                }

                // Map the job details to a better format, excluding similar_jobs, recruiter_details, and people_also_viewed
                const jobDetails = data.map((job: {
                    job_position: string;
                    job_location: string;
                    company_name: string;
                    company_linkedin_id: string;
                    job_posting_time: string;
                    job_description: string;
                    Seniority_level: string;
                    Employment_type: string;
                    Job_function: string;
                    Industries: string;
                }) => ({
                    jobPosition: job.job_position,
                    jobLocation: job.job_location,
                    companyName: job.company_name,
                    companyLinkedinId: job.company_linkedin_id,
                    jobPostingTime: job.job_posting_time,
                    jobDescription: job.job_description,
                    seniorityLevel: job.Seniority_level,
                    employmentType: job.Employment_type,
                    jobFunction: job.Job_function,
                    industries: job.Industries,
                }));

                return {
                    jobId,
                    jobDetails: jobDetails[0],
                    timestamp: new Date().toISOString()
                };
            } else {
                throw new McpError(
                    ErrorCode.InternalError,
                    `Unexpected response status: ${response.status}`
                );
            }
        } catch (error: any) {
            console.error('[API] Error fetching job details:', error);

            if (error.response && error.response.status === 404) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Job posting with ID ${jobId} not found`
                );
            } else {
                throw new McpError(
                    ErrorCode.InternalError,
                    `Failed to fetch job details: ${error.message}`
                );
            }
        }
    }

    private async fetchCompanyInformation(companyName: string, linkedInId?: string) {
        try {
            console.error(`[API] Fetching company information for: ${companyName}`);

            // If linkedInId is provided, use it directly
            let linkId = linkedInId;

            // If linkedInId is not provided, try to determine it from company name
            if (!linkId) {
                // Generate a likely LinkedIn ID from company name
                linkId = this.generateLinkedInId(companyName);
                console.error(`[API] Generated LinkedIn ID: ${linkId}`);
            }

            // Fetch the company profile from ScrapingDog
            const response = await axios.get(this.companyProfileUrl, {
                params: {
                    api_key: this.apiKey,
                    type: 'company',
                    linkId: linkId,
                },
            });

            if (response.status === 200) {
                const data = response.data;

                if (!data || data.length === 0) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `No information found for company: ${companyName}`
                    );
                }

                // Process the company data
                const companyData = data[0]; // The response is an array with the company as the first item

                // Format the data for better readability and structure
                const formattedCompanyData = {
                    name: companyData.company_name,
                    linkedInId: companyData.universal_name_id,
                    industry: companyData.industry,
                    specialties: companyData.specialties,
                    founded: companyData.founded,
                    companySize: companyData.company_size,
                    companySizeOnLinkedIn: companyData.company_size_on_linkedin,
                    companyType: companyData.type,
                    website: companyData.website,
                    headquarters: companyData.headquarters,
                    locations: companyData.locations,
                    about: companyData.about,

                    // Key people
                    employees: companyData.employees,

                    // Recent activity
                    recentUpdates: companyData.updates && companyData.updates.length > 0
                        ? companyData.updates.slice(0, 3).map((update: any) => ({
                            text: update.text,
                            postedDate: update.article_posted_date,
                            likes: update.total_likes,
                            title: update.article_title,
                            link: update.article_link
                        }))
                        : [],
                };

                return {
                    companyName: companyName,
                    linkedInId: linkId,
                    companyData: formattedCompanyData,
                    timestamp: new Date().toISOString()
                };
            } else {
                throw new McpError(
                    ErrorCode.InternalError,
                    `Unexpected response status: ${response.status}`
                );
            }
        } catch (error: any) {
            console.error('[API] Error fetching company information:', error);

            if (error.response && error.response.status === 404) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Company profile not found for: ${companyName}. LinkedIn ID tried: ${linkedInId || this.generateLinkedInId(companyName)}`
                );
            } else {
                throw new McpError(
                    ErrorCode.InternalError,
                    `Failed to fetch company information: ${error.message}`
                );
            }
        }
    }

    private generateLinkedInId(companyName: string): string {
        // Common company name patterns on LinkedIn
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

        // Check if the company name is in our known list
        const lowerName = companyName.toLowerCase();
        for (const [key, value] of Object.entries(knownCompanyIds)) {
            if (lowerName.includes(key)) {
                return value;
            }
        }

        // Otherwise, generate a likely LinkedIn ID
        // Convert to lowercase, replace spaces with hyphens, remove special characters
        return companyName
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')  // Remove special characters
            .replace(/\s+/g, '-')      // Replace spaces with hyphens
            .replace(/-+/g, '-')       // Replace multiple hyphens with single hyphen
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
}

const server = new CompanyInfoServer();
server.run().catch(console.error);