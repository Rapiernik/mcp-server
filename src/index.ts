#!/usr/bin/env node
import axios from 'axios';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError,} from '@modelcontextprotocol/sdk/types.js';

// Define types for mock data
interface CompanyEmployee {
    name: string;
    position: string;
    link: string;
}

interface CompanyUpdate {
    text: string;
    article_posted_date: string;
    total_likes: number;
    article_title: string;
    article_link: string;
}

interface CompanyInfo {
    company_name: string;
    linkedin_internal_id: string;
    industry: string;
    specialties: string;
    founded: string;
    company_size: string;
    company_size_on_linkedin: string;
    type: string;
    website: string;
    headquarters: string;
    locations: string[];
    about: string;
    employees: CompanyEmployee[];
    updates: CompanyUpdate[];
}

interface JobPosting {
    jobId: string;
    jobPosition: string;
    jobLink: string;
    companyName: string;
    companyProfile: string;
    jobLocation: string;
    jobPostingDate: string;
}

interface JobDetail {
    jobPosition: string;
    jobLocation: string;
    companyName: string;
    companyLinkedinId: string;
    jobPostingTime: string;
    jobDescription: string;
    seniorityLevel: string;
    employmentType: string;
    jobFunction: string;
    industries: string;
}

// Mock data with appropriate type definitions
const MOCK_COMPANY_INFO: Record<string, CompanyInfo> = {
    'rtl-nederland': {
        company_name: 'RTL Nederland',
        linkedin_internal_id: '1234567',
        industry: 'Media Production',
        specialties: 'Broadcasting, Advertising, Digital Media, Content Creation, Television',
        founded: '1989',
        company_size: '1001-5000 employees',
        company_size_on_linkedin: '1563 employees on LinkedIn',
        type: 'Public Company',
        website: 'www.rtl.nl',
        headquarters: 'Hilversum, North Holland, Netherlands',
        locations: ['Hilversum, North Holland, Netherlands'],
        about: 'RTL Nederland is a leading media company in entertainment, news and information. We touch the lives of millions of people every day.',
        employees: [
            {name: 'Sven Sauvé', position: 'CEO', link: 'linkedin.com/in/svensauve'},
            {name: 'Bart Verhoeven', position: 'CTO', link: 'linkedin.com/in/bartverhoeven'},
            {name: 'Peter van der Vorst', position: 'Content Director', link: 'linkedin.com/in/petervandervorst'}
        ],
        updates: [
            {
                text: 'RTL is launching a new streaming platform',
                article_posted_date: '2023-10-01',
                total_likes: 245,
                article_title: 'New Streaming Platform Launch',
                article_link: 'linkedin.com/company/rtl-nederland/posts/new-streaming'
            },
            {
                text: 'RTL Tech Team expanding with new AI initiatives',
                article_posted_date: '2023-09-15',
                total_likes: 187,
                article_title: 'Technology Innovation',
                article_link: 'linkedin.com/company/rtl-nederland/posts/tech-innovation'
            }
        ]
    },
    'npo': {
        company_name: 'Nederlandse Publieke Omroep',
        linkedin_internal_id: '7654321',
        industry: 'Broadcast Media',
        specialties: 'Public Broadcasting, Television, Radio, Digital Media',
        founded: '1969',
        company_size: '1001-5000 employees',
        company_size_on_linkedin: '1248 employees on LinkedIn',
        type: 'Government Agency',
        website: 'www.npo.nl',
        headquarters: 'Hilversum, North Holland, Netherlands',
        locations: ['Hilversum, North Holland, Netherlands'],
        about: 'NPO is the Dutch public broadcaster, providing television, radio and digital content to the Dutch public.',
        employees: [
            {name: 'Frans Klein', position: 'Media Director', link: 'linkedin.com/in/fransklein'},
            {name: 'Martijn van Dam', position: 'Chairman', link: 'linkedin.com/in/martijnvandam'},
            {name: 'Jurre Bosman', position: 'Radio Director', link: 'linkedin.com/in/jurrebosman'}
        ],
        updates: [
            {
                text: 'NPO enhances digital accessibility features',
                article_posted_date: '2023-10-05',
                total_likes: 156,
                article_title: 'Digital Accessibility',
                article_link: 'linkedin.com/company/npo/posts/digital-accessibility'
            }
        ]
    },
    'shell': {
        company_name: 'Shell',
        linkedin_internal_id: '1543267',
        industry: 'Oil & Energy',
        specialties: 'Energy, Renewables, Oil, Gas, Petrochemicals',
        founded: '1907',
        company_size: '10001+ employees',
        company_size_on_linkedin: '28763 employees on LinkedIn',
        type: 'Public Company',
        website: 'www.shell.com',
        headquarters: 'The Hague, South Holland, Netherlands',
        locations: ['The Hague, Netherlands', 'London, UK', 'Houston, TX'],
        about: 'Shell is a global energy company with expertise in exploration, production, refining and marketing of oil and natural gas, and the manufacturing and marketing of chemicals.',
        employees: [
            {name: 'Wael Sawan', position: 'CEO', link: 'linkedin.com/in/waelsawan'},
            {name: 'Huibert Vigeveno', position: 'Downstream Director', link: 'linkedin.com/in/huibertvigeveno'},
            {name: 'Zoe Yujnovich', position: 'Upstream Director', link: 'linkedin.com/in/zoeyujnovich'}
        ],
        updates: [
            {
                text: 'Shell announces progress in renewable energy investments',
                article_posted_date: '2023-09-28',
                total_likes: 542,
                article_title: 'Renewable Energy Investments',
                article_link: 'linkedin.com/company/shell/posts/renewables'
            }
        ]
    }
};

// Mock job postings with proper type definition
const MOCK_JOB_POSTINGS: Record<string, JobPosting[]> = {
    '1234567': [
        {
            jobId: 'job123456',
            jobPosition: 'Senior Software Engineer',
            jobLink: 'linkedin.com/jobs/view/senior-software-engineer-rtl-nederland',
            companyName: 'RTL Nederland',
            companyProfile: 'linkedin.com/company/rtl-nederland',
            jobLocation: 'Hilversum, Netherlands',
            jobPostingDate: '2 weeks ago'
        },
        {
            jobId: 'job123457',
            jobPosition: 'DevOps Engineer',
            jobLink: 'linkedin.com/jobs/view/devops-engineer-rtl-nederland',
            companyName: 'RTL Nederland',
            companyProfile: 'linkedin.com/company/rtl-nederland',
            jobLocation: 'Amsterdam, Netherlands',
            jobPostingDate: '1 month ago'
        },
        {
            jobId: 'job123458',
            jobPosition: 'Data Scientist',
            jobLink: 'linkedin.com/jobs/view/data-scientist-rtl-nederland',
            companyName: 'RTL Nederland',
            companyProfile: 'linkedin.com/company/rtl-nederland',
            jobLocation: 'Hilversum, Netherlands',
            jobPostingDate: '3 weeks ago'
        }
    ],
    '7654321': [
        {
            jobId: 'job789456',
            jobPosition: 'Frontend Developer',
            jobLink: 'linkedin.com/jobs/view/frontend-developer-npo',
            companyName: 'Nederlandse Publieke Omroep',
            companyProfile: 'linkedin.com/company/npo',
            jobLocation: 'Hilversum, Netherlands',
            jobPostingDate: '1 week ago'
        },
        {
            jobId: 'job789457',
            jobPosition: 'Cloud Engineer',
            jobLink: 'linkedin.com/jobs/view/cloud-engineer-npo',
            companyName: 'Nederlandse Publieke Omroep',
            companyProfile: 'linkedin.com/company/npo',
            jobLocation: 'Hilversum, Netherlands',
            jobPostingDate: '2 months ago'
        }
    ],
    '1543267': [
        {
            jobId: 'job456123',
            jobPosition: 'Machine Learning Engineer',
            jobLink: 'linkedin.com/jobs/view/machine-learning-engineer-shell',
            companyName: 'Shell',
            companyProfile: 'linkedin.com/company/shell',
            jobLocation: 'Amsterdam, Netherlands',
            jobPostingDate: '3 days ago'
        },
        {
            jobId: 'job456124',
            jobPosition: 'Data Engineer',
            jobLink: 'linkedin.com/jobs/view/data-engineer-shell',
            companyName: 'Shell',
            companyProfile: 'linkedin.com/company/shell',
            jobLocation: 'The Hague, Netherlands',
            jobPostingDate: '1 month ago'
        },
        {
            jobId: 'job456125',
            jobPosition: 'Cloud Security Architect',
            jobLink: 'linkedin.com/jobs/view/cloud-security-architect-shell',
            companyName: 'Shell',
            companyProfile: 'linkedin.com/company/shell',
            jobLocation: 'Rotterdam, Netherlands',
            jobPostingDate: '2 weeks ago'
        }
    ]
};

// Mock job details with proper type definition
const MOCK_JOB_DETAILS: Record<string, JobDetail> = {
    'job123456': {
        jobPosition: 'Senior Software Engineer',
        jobLocation: 'Hilversum, Netherlands',
        companyName: 'RTL Nederland',
        companyLinkedinId: 'rtl-nederland',
        jobPostingTime: '2 weeks ago',
        jobDescription: `We are looking for a Senior Software Engineer to join our team at RTL Nederland.

Requirements:
- 5+ years experience in backend development
- Proficiency in Java, Spring Boot, and microservices architecture
- Experience with AWS cloud services
- Knowledge of containerization with Docker and Kubernetes
- Familiarity with CI/CD pipelines and DevOps practices

We offer:
- Competitive salary and benefits
- Opportunity to work on innovative streaming platforms
- Flexible working environment
- Professional development opportunities`,
        seniorityLevel: 'Senior',
        employmentType: 'Full-time',
        jobFunction: 'Engineering',
        industries: 'Media and Broadcasting'
    },
    'job123457': {
        jobPosition: 'DevOps Engineer',
        jobLocation: 'Amsterdam, Netherlands',
        companyName: 'RTL Nederland',
        companyLinkedinId: 'rtl-nederland',
        jobPostingTime: '1 month ago',
        jobDescription: `RTL Nederland is seeking a DevOps Engineer to strengthen our infrastructure team.

Responsibilities:
- Implement and maintain CI/CD pipelines
- Manage cloud infrastructure on AWS
- Automate development and operational processes
- Monitor system performance and troubleshoot issues
- Work with development teams to optimize deployment workflows

Requirements:
- 3+ years of DevOps experience
- Strong knowledge of AWS services (EC2, S3, Lambda, RDS)
- Experience with Docker, Kubernetes, and container orchestration
- Proficiency in infrastructure as code (Terraform, CloudFormation)
- Knowledge of monitoring tools (Prometheus, Grafana, ELK stack)
- CI/CD experience (Jenkins, GitHub Actions, GitLab CI)

We offer:
- Competitive compensation package
- Hybrid working model
- Professional development budget
- Modern tech stack and collaborative environment`,
        seniorityLevel: 'Mid-Senior level',
        employmentType: 'Full-time',
        jobFunction: 'Information Technology',
        industries: 'Media and Broadcasting'
    },
    'job123458': {
        jobPosition: 'Data Scientist',
        jobLocation: 'Hilversum, Netherlands',
        companyName: 'RTL Nederland',
        companyLinkedinId: 'rtl-nederland',
        jobPostingTime: '3 weeks ago',
        jobDescription: `RTL Nederland is looking for a Data Scientist to join our growing Data & Analytics team.

Your role:
- Develop and implement machine learning models to enhance our recommender systems
- Analyze user behavior data to improve content personalization
- Work with big data technologies to process and analyze large datasets
- Collaborate with product teams to integrate insights into user-facing applications
- Present findings to stakeholders and translate insights into actionable recommendations

Requirements:
- MSc or PhD in Computer Science, Statistics, or related quantitative field
- 2+ years of professional experience in data science or machine learning
- Strong programming skills in Python, including libraries such as Pandas, NumPy, scikit-learn
- Experience with SQL and data processing at scale
- Knowledge of modern machine learning frameworks (TensorFlow, PyTorch)
- Understanding of recommendation systems and personalization algorithms
- Experience with cloud platforms (preferably AWS)

What we offer:
- Work on data projects that impact millions of viewers daily
- Access to rich user behavior datasets
- Collaborative, innovative work environment
- Continuous learning and development opportunities
- Competitive compensation and flexible working conditions`,
        seniorityLevel: 'Mid-Senior level',
        employmentType: 'Full-time',
        jobFunction: 'Data Science',
        industries: 'Media and Broadcasting'
    },
    'job789456': {
        jobPosition: 'Frontend Developer',
        jobLocation: 'Hilversum, Netherlands',
        companyName: 'Nederlandse Publieke Omroep',
        companyLinkedinId: 'npo',
        jobPostingTime: '1 week ago',
        jobDescription: `NPO is looking for a Frontend Developer to enhance our digital platforms.

Your skills:
- Strong proficiency in JavaScript/TypeScript, React, and modern frontend frameworks
- Experience with responsive design and CSS preprocessors
- Knowledge of frontend testing frameworks
- Understanding of web accessibility standards
- Experience with version control systems (Git)

What we offer:
- Working on high-traffic public broadcasting platforms
- Collaborative team environment
- Professional growth opportunities
- Good work-life balance`,
        seniorityLevel: 'Mid-Senior level',
        employmentType: 'Full-time',
        jobFunction: 'Information Technology',
        industries: 'Broadcast Media'
    },
    'job789457': {
        jobPosition: 'Cloud Engineer',
        jobLocation: 'Hilversum, Netherlands',
        companyName: 'Nederlandse Publieke Omroep',
        companyLinkedinId: 'npo',
        jobPostingTime: '2 months ago',
        jobDescription: `NPO is seeking a Cloud Engineer to help manage and optimize our cloud infrastructure.

Responsibilities:
- Design, implement and maintain cloud-based solutions on AWS
- Migrate and modernize existing applications to cloud architecture
- Implement security best practices and ensure compliance
- Optimize cloud costs and performance
- Support development teams with infrastructure needs

Requirements:
- 3+ years experience with AWS services and architecture
- Knowledge of infrastructure as code (Terraform or CloudFormation)
- Experience with containerization (Docker, Kubernetes)
- Understanding of networking, security, and compliance in cloud environments
- Experience with monitoring and logging solutions

We offer:
- Work with modern cloud technologies
- Impact millions of Dutch viewers through your work
- Professional development opportunities
- Good work-life balance with flexible hours
- Collaborative, mission-driven environment`,
        seniorityLevel: 'Mid-Senior level',
        employmentType: 'Full-time',
        jobFunction: 'Information Technology',
        industries: 'Broadcast Media'
    },
    'job456123': {
        jobPosition: 'Machine Learning Engineer',
        jobLocation: 'Amsterdam, Netherlands',
        companyName: 'Shell',
        companyLinkedinId: 'shell',
        jobPostingTime: '3 days ago',
        jobDescription: `Join Shell's Digital Innovation team as a Machine Learning Engineer.

Responsibilities:
- Develop and implement machine learning models for energy optimization
- Work with big data technologies and cloud platforms
- Collaborate with domain experts to solve complex energy challenges
- Deploy and monitor ML solutions in production environments

Requirements:
- MSc or PhD in Computer Science, Data Science, or related field
- Experience with Python, TensorFlow/PyTorch, and scikit-learn
- Knowledge of cloud platforms (AWS, Azure, GCP)
- Experience with data processing frameworks like Spark
- Understanding of MLOps and model deployment`,
        seniorityLevel: 'Mid-Senior level',
        employmentType: 'Full-time',
        jobFunction: 'Artificial Intelligence',
        industries: 'Oil & Energy'
    },
    'job456124': {
        jobPosition: 'Data Engineer',
        jobLocation: 'The Hague, Netherlands',
        companyName: 'Shell',
        companyLinkedinId: 'shell',
        jobPostingTime: '1 month ago',
        jobDescription: `Shell is looking for a Data Engineer to join our Digital team.

Your role:
- Design, build, and maintain data pipelines and ETL processes
- Implement data storage solutions that are scalable and efficient
- Collaborate with data scientists to deploy models to production
- Ensure data quality, consistency, and availability across platforms
- Work with modern big data and cloud technologies

Requirements:
- Bachelor's or Master's degree in Computer Science, Engineering, or related field
- 3+ years of experience in data engineering roles
- Strong SQL skills and experience with data warehousing concepts
- Experience with cloud platforms (AWS, Azure, or GCP)
- Knowledge of big data technologies (Hadoop, Spark, Kafka)
- Programming skills in Python and/or Java
- Understanding of data modeling, data access, and data storage techniques

We offer:
- Opportunity to work on global-scale data challenges
- Collaborative environment with cross-functional teams
- Competitive compensation and benefits
- Professional development opportunities
- Hybrid working model`,
        seniorityLevel: 'Mid-Senior level',
        employmentType: 'Full-time',
        jobFunction: 'Data Engineering',
        industries: 'Oil & Energy'
    },
    'job456125': {
        jobPosition: 'Cloud Security Architect',
        jobLocation: 'Rotterdam, Netherlands',
        companyName: 'Shell',
        companyLinkedinId: 'shell',
        jobPostingTime: '2 weeks ago',
        jobDescription: `Shell is seeking a Cloud Security Architect to strengthen our digital security posture.

Responsibilities:
- Design and implement security architecture for cloud environments
- Develop security standards, guidelines, and best practices
- Conduct security assessments and risk analysis
- Collaborate with IT and development teams on secure solutions
- Stay current with emerging security threats and mitigation strategies

Requirements:
- 5+ years of experience in IT security
- Strong knowledge of cloud security principles and technologies
- Experience with major cloud platforms (AWS, Azure, GCP)
- Understanding of compliance frameworks (ISO 27001, NIST, etc.)
- Knowledge of DevSecOps practices and tools
- Security certifications (CISSP, CCSP, or equivalent)
- Experience with implementing zero-trust architecture

What we offer:
- Leadership role in defining security standards
- Complex and challenging security landscape
- Competitive compensation package
- Professional growth opportunities
- Collaborative international environment`,
        seniorityLevel: 'Senior',
        employmentType: 'Full-time',
        jobFunction: 'Information Security',
        industries: 'Oil & Energy'
    }
};

class CompanyInfoServer {
    private server: Server;

    constructor() {
        console.error('[Setup] Initializing Company Information MCP server with mock data...');

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

                    console.error(`[MOCK] Fetching job postings for company: ${args.company} in ${args.country} with ID: ${args.companyId}`);

                    const jobPostings = this.mockFetchCompanyJobPostings(args.company, args.country, args.companyId);

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

                    console.error(`[MOCK] Fetching details for job ID: ${args.jobId}`);

                    const jobDetails = this.mockFetchJobPostingDetails(args.jobId);

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

                    console.error(`[MOCK] Fetching company information for: ${args.companyName}`);

                    const companyInfo = this.mockFetchCompanyInformation(args.companyName, args.linkedInId);

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(companyInfo, null, 2),
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

            const ANY_MAIL_API_KEY = process.env.ANY_MAIL_API_KEY;
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
                validateStatus: (status) => status >= 200 && status < 500, // Accept any response for custom handling
            });

            console.error(`[API] Received response with status: ${response.status}`);

            const data = response.data;

            console.log('[API] Response data:', data);

            if (response.status === 200 && data.success) {
                // Successful response
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
                throw error; // Re-throw MCP errors
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

    private mockFetchCompanyJobPostings(company: string, country: string, companyId: string) {
        // Check if we have mock data for this company ID
        if (MOCK_JOB_POSTINGS[companyId]) {
            // Return job postings from our mock data
            const jobPostings = MOCK_JOB_POSTINGS[companyId];

            // Filter for just technical jobs (already filtered in our mock data)
            return {
                company,
                country,
                filteredJobPostings: jobPostings,
                totalCount: jobPostings.length,
                timestamp: new Date().toISOString()
            };
        } else {
            // Return empty result if company ID not found in mock data
            console.error(`[MOCK] No job postings found for company ID: ${companyId}`);
            return {
                company,
                country,
                filteredJobPostings: [],
                totalCount: 0,
                timestamp: new Date().toISOString()
            };
        }
    }

    private mockFetchJobPostingDetails(jobId: string) {
        // Check if we have mock data for this job ID
        if (MOCK_JOB_DETAILS[jobId]) {
            // Return job details from our mock data
            return {
                jobId,
                jobDetails: MOCK_JOB_DETAILS[jobId],
                timestamp: new Date().toISOString()
            };
        } else {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Job posting with ID ${jobId} not found in mock data`
            );
        }
    }

    private mockFetchCompanyInformation(companyName: string, linkedInId?: string) {
        // Determine which LinkedIn ID to use
        let linkId = linkedInId || this.generateLinkedInId(companyName);

        // Check if we have mock data for this LinkedIn ID
        if (MOCK_COMPANY_INFO[linkId]) {
            const companyData = MOCK_COMPANY_INFO[linkId];

            // Format the data for better readability and structure
            const formattedCompanyData = {
                name: companyData.company_name,
                companyId: companyData.linkedin_internal_id,
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
                employees: companyData.employees,
                recentUpdates: companyData.updates && companyData.updates.length > 0
                    ? companyData.updates.map((update) => ({
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
            // Try to find a partial match
            for (const [id, info] of Object.entries(MOCK_COMPANY_INFO)) {
                if (info.company_name.toLowerCase().includes(companyName.toLowerCase())) {
                    // Found a partial match, use it
                    linkId = id;
                    const companyData = MOCK_COMPANY_INFO[linkId];

                    // Format the data for better readability and structure
                    const formattedCompanyData = {
                        name: companyData.company_name,
                        companyId: companyData.linkedin_internal_id,
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
                        employees: companyData.employees,
                        recentUpdates: companyData.updates && companyData.updates.length > 0
                            ? companyData.updates.map((update) => ({
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
                }
            }

            // If no match found at all, throw an error
            throw new McpError(
                ErrorCode.InvalidParams,
                `Company information not found for: ${companyName} with LinkedIn ID: ${linkId}`
            );
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

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Company Information MCP server with MOCK DATA running on stdio');
    }
}

const server = new CompanyInfoServer();
server.run().catch(console.error);