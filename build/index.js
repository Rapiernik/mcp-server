#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
class MockServer {
    server;
    constructor() {
        console.error('[Setup] Initializing Health Advice MCP server...');
        this.server = new index_js_1.Server({
            name: 'health-advice-server',
            version: '0.1.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupToolHandlers();
        this.server.onerror = (error) => console.error('[Error]', error);
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }
    setupToolHandlers() {
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'get_health_advice',
                    description: 'Get health advice for various conditions',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            condition: {
                                type: 'string',
                                description: 'Health condition (e.g. headache, hangover)',
                            },
                        },
                        required: ['condition'],
                    },
                },
            ],
        }));
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
            try {
                const toolName = request.params.name;
                if (toolName !== 'get_health_advice') {
                    throw new types_js_1.McpError(types_js_1.ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
                }
                const args = request.params.arguments;
                if (!args.condition) {
                    throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, 'Missing required parameter: condition');
                }
                console.error(`[API] Fetching health advice for condition: ${args.condition}`);
                // Simulate API delay
                await new Promise(resolve => setTimeout(resolve, 300));
                // Mock health advice responses
                const healthResponses = {
                    "hangover": {
                        advice: "Drink plenty of water and rest. Take some painkillers if needed and eat light, bland foods.",
                        severity: "moderate",
                        recovery_time: "24 hours"
                    },
                    "headache": {
                        advice: "Try ibuprofen or a cold compress. Rest in a dark, quiet room and stay hydrated.",
                        severity: "mild",
                        recovery_time: "2-4 hours"
                    },
                    "cold": {
                        advice: "Get plenty of rest and drink fluids. Over-the-counter medications can help with symptoms.",
                        severity: "mild",
                        recovery_time: "7-10 days"
                    },
                    "fever": {
                        advice: "Take acetaminophen or ibuprofen to reduce fever. See a doctor if temperature exceeds 103°F (39.4°C) or persists for more than 3 days.",
                        severity: "moderate",
                        recovery_time: "3-5 days"
                    },
                    "cough": {
                        advice: "Stay hydrated and use honey to soothe your throat. Over-the-counter cough suppressants may help at night.",
                        severity: "mild",
                        recovery_time: "1-2 weeks"
                    },
                    "sore throat": {
                        advice: "Gargle with warm salt water, drink warm liquids, and use throat lozenges. Rest your voice when possible.",
                        severity: "mild",
                        recovery_time: "5-7 days"
                    },
                    "back pain": {
                        advice: "Apply ice for the first 48-72 hours, then switch to heat. Gentle stretching and over-the-counter pain relievers can help.",
                        severity: "moderate",
                        recovery_time: "2-4 weeks"
                    },
                    "sprain": {
                        advice: "Follow the RICE protocol: Rest, Ice, Compression, and Elevation. Avoid weight-bearing activities until pain subsides.",
                        severity: "moderate",
                        recovery_time: "1-6 weeks depending on severity"
                    }
                };
                const response = healthResponses[args.condition.toLowerCase()] || {
                    advice: "No specific advice found for this condition. If symptoms persist, please consult with a healthcare professional.",
                    severity: "unknown",
                    recovery_time: "unknown"
                };
                response.timestamp = new Date().toISOString();
                response.disclaimer = "This is mock health advice and should not replace professional medical consultation.";
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(response, null, 2),
                        },
                    ],
                };
            }
            catch (error) {
                if (error instanceof Error) {
                    console.error('[Error] Failed to process request:', error);
                    throw new types_js_1.McpError(types_js_1.ErrorCode.InternalError, `Failed to process request: ${error.message}`);
                }
                throw error;
            }
        });
    }
    async run() {
        const transport = new stdio_js_1.StdioServerTransport();
        await this.server.connect(transport);
        console.error('Health Advice MCP server running on stdio');
    }
}
const server = new MockServer();
server.run().catch(console.error);
