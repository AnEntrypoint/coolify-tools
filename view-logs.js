#!/usr/bin/env node

/**
 * View Deployment Logs from Coolify
 *
 * This module extends the CoolifyDeploy class to add log viewing functionality
 * It fetches the latest deployment and displays its logs
 */

const https = require('https');
const { URL } = require('url');

class CoolifyLogs {
    constructor(baseURL = null) {
        this.baseURL = baseURL || process.env.COOLIFY_URL || 'https://coolify.acc.l-inc.co.za';
        this.cookies = '';
        this.csrfToken = null;
        this.projectId = null;
        this.environmentId = null;
        this.applicationId = null;
    }

    async request(url, options = {}) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const opts = {
                hostname: urlObj.hostname,
                port: urlObj.port || 443,
                path: urlObj.pathname + urlObj.search,
                method: options.method || 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Connection': 'keep-alive',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    ...options.headers
                }
            };

            if (this.cookies) opts.headers['Cookie'] = this.cookies;
            if (this.csrfToken) opts.headers['X-CSRF-Token'] = this.csrfToken;

            if (options.body) {
                const body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
                opts.headers['Content-Length'] = Buffer.byteLength(body);
            }

            const req = https.request(opts, (res) => {
                // Capture cookies from Set-Cookie header immediately
                if (res.headers['set-cookie']) {
                    this.cookies = res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
                }

                // Handle redirects
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    const redirectUrl = res.headers.location.startsWith('http')
                        ? res.headers.location
                        : `${this.baseURL}${res.headers.location}`;
                    return this.request(redirectUrl, options).then(resolve).catch(reject);
                }

                let data = '';
                res.on('data', chunk => data += chunk);

                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        resolve({ status: res.statusCode, body: json, headers: res.headers });
                    } catch (e) {
                        resolve({ status: res.statusCode, body: data, headers: res.headers });
                    }
                });
            });

            req.on('error', reject);
            if (options.body) {
                const body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
                req.write(body);
            }
            req.end();
        });
    }

    async login(email, password) {
        console.log('🔐 Logging in...');

        // Get CSRF token from login page
        const loginPageRes = await this.request(`${this.baseURL}/login`);
        const csrfMatch = loginPageRes.body.match(/<meta name="csrf-token" content="([^"]+)"/);
        this.csrfToken = csrfMatch ? csrfMatch[1] : null;

        // Submit login form
        const loginRes = await this.request(`${this.baseURL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-CSRF-Token': this.csrfToken,
                'Referer': `${this.baseURL}/login`
            },
            body: new URLSearchParams({
                email,
                password
            }).toString()
        });

        if (loginRes.body.includes('These credentials do not match')) {
            throw new Error('Invalid email or password');
        }

        console.log('✅ Logged in successfully\n');
        return true;
    }

    async discoverResources() {
        console.log('🔍 Discovering projects, environments, and applications...');

        try {
            const dashboardRes = await this.request(`${this.baseURL}/dashboard`);

            // Extract project IDs
            const projectRegex = /\/project\/([a-z0-9]+)/g;
            let match;
            const projects = [];

            while ((match = projectRegex.exec(dashboardRes.body)) !== null) {
                if (!projects.includes(match[1])) {
                    projects.push(match[1]);
                }
            }

            if (projects.length > 0) {
                this.projectId = projects[0];
                console.log(`Found project: ${this.projectId}`);

                // Now get environment and application from the first project
                const projectRes = await this.request(`${this.baseURL}/project/${this.projectId}`);

                const envRegex = /\/environment\/([a-z0-9]+)/g;
                const environments = [];

                while ((match = envRegex.exec(projectRes.body)) !== null) {
                    if (!environments.includes(match[1])) {
                        environments.push(match[1]);
                    }
                }

                if (environments.length > 0) {
                    this.environmentId = environments[0];
                    console.log(`Found environment: ${this.environmentId}`);

                    // Get application
                    const appRegex = /\/application\/([a-z0-9]+)/g;
                    const applications = [];

                    while ((match = appRegex.exec(projectRes.body)) !== null) {
                        if (!applications.includes(match[1])) {
                            applications.push(match[1]);
                        }
                    }

                    if (applications.length > 0) {
                        this.applicationId = applications[0];
                        console.log(`Found application: ${this.applicationId}\n`);
                        return true;
                    }
                }
            }

            return false;
        } catch (e) {
            console.error('Error discovering resources:', e.message);
            return false;
        }
    }

    async getDeploymentsList() {
        console.log('📋 Fetching deployments list...');

        // If we don't have the IDs, try to discover them
        if (!this.projectId || !this.environmentId || !this.applicationId) {
            const discovered = await this.discoverResources();
            if (!discovered) {
                console.error('❌ Could not discover project/environment/application IDs');
                return [];
            }
        }

        const deploymentsPageUrl = `${this.baseURL}/project/${this.projectId}/environment/${this.environmentId}/application/${this.applicationId}/deployment`;
        const res = await this.request(deploymentsPageUrl);

        // Extract deployment links from HTML
        const deploymentLinks = [];
        const deploymentRegex = /\/deployment\/([a-z0-9]{24})/g;
        let match;

        while ((match = deploymentRegex.exec(res.body)) !== null) {
            if (!deploymentLinks.includes(match[1])) {
                deploymentLinks.push(match[1]);
            }
        }

        console.log(`✅ Found ${deploymentLinks.length} deployments\n`);
        return deploymentLinks;
    }

    async getDeploymentDetails(deploymentId) {
        console.log(`📦 Getting deployment details for ${deploymentId}...`);

        const deploymentPageUrl = `${this.baseURL}/project/${this.projectId}/environment/${this.environmentId}/application/${this.applicationId}/deployment/${deploymentId}`;
        const res = await this.request(deploymentPageUrl);

        // Extract deployment information from HTML
        const details = {
            id: deploymentId,
            url: deploymentPageUrl,
            statusMatch: res.body.match(/Success|Failed|Running|Pending/),
            status: null,
            startedAt: null,
            endedAt: null
        };

        if (details.statusMatch) {
            details.status = details.statusMatch[0];
        }

        // Try to extract timestamps
        const startedMatch = res.body.match(/Started:\s*([^<]+)/);
        const endedMatch = res.body.match(/Ended:\s*([^<]+)/);

        if (startedMatch) details.startedAt = startedMatch[1];
        if (endedMatch) details.endedAt = endedMatch[1];

        console.log(`✅ Deployment Status: ${details.status || 'Unknown'}`);
        if (details.startedAt) console.log(`   Started: ${details.startedAt}`);
        if (details.endedAt) console.log(`   Ended: ${details.endedAt}`);
        console.log();

        return details;
    }

    async getDeploymentLogs(deploymentId) {
        console.log(`📜 Fetching deployment logs for ${deploymentId}...\n`);

        // Try the deployment page
        const logsPageUrl = `${this.baseURL}/project/${this.projectId}/environment/${this.environmentId}/application/${this.applicationId}/deployment/${deploymentId}`;
        const res = await this.request(logsPageUrl);

        let logsContent = null;
        let logFound = false;

        // Strategy 1: Extract from Livewire component snapshot data
        const wireMatch = res.body.match(/wire:snapshot="([^"]+)"/);
        if (wireMatch) {
            try {
                // Decode HTML entities in the snapshot
                let decoded = wireMatch[1]
                    .replace(/&quot;/g, '"')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, '&');

                const wireData = JSON.parse(decoded);

                // Look for fields that might contain deployment output
                if (wireData.data && wireData.data.output) {
                    logsContent = wireData.data.output;
                    logFound = true;
                } else if (wireData.data && wireData.data.logs) {
                    logsContent = wireData.data.logs;
                    logFound = true;
                } else if (wireData.data && wireData.data.deployment_logs) {
                    logsContent = wireData.data.deployment_logs;
                    logFound = true;
                } else if (wireData.data) {
                    // Search for any field containing significant log-like data
                    for (const [key, value] of Object.entries(wireData.data || {})) {
                        if (typeof value === 'string' && value.length > 500) {
                            logsContent = value;
                            logFound = true;
                            break;
                        }
                    }
                }
            } catch (e) {
                console.error('Error parsing wire snapshot:', e.message);
            }
        }

        // Strategy 2: Extract from HTML rendered logs section
        if (!logFound) {
            // Look for error messages or status blocks
            const errorMatch = res.body.match(/<[^>]*>(Error|Server is not functional)[^<]*<\/[^>]*>/);
            if (errorMatch) {
                logsContent = errorMatch[0];
                logFound = true;
            }
        }

        // Strategy 3: Look for pre/code tags as fallback
        if (!logFound) {
            const preMatch = res.body.match(/<pre[^>]*>([\s\S]{1,5000}?)<\/pre>/);
            if (preMatch) {
                logsContent = preMatch[1];
                logFound = true;
            }
        }

        // Strategy 4: Look for code tags
        if (!logFound) {
            const codeMatch = res.body.match(/<code[^>]*>([\s\S]{1,5000}?)<\/code>/);
            if (codeMatch) {
                logsContent = codeMatch[1];
                logFound = true;
            }
        }

        // Strategy 5: Extract any substantial text content that looks like logs
        if (!logFound) {
            const textMatch = res.body.match(/(step|clone|install|build|error|failed|success|docker)[^\n]{0,200}/gi);
            if (textMatch && textMatch.length > 0) {
                logsContent = textMatch.join('\n');
                logFound = true;
            }
        }

        if (logFound && logsContent) {
            // Decode HTML entities
            logsContent = String(logsContent)
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&#039;/g, "'")
                .replace(/&nbsp;/g, ' ')
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '\r')
                .replace(/\\t/g, '\t')
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<[^>]+>/g, ''); // Remove remaining HTML tags

            console.log('--- DEPLOYMENT LOGS ---\n');
            const displayContent = logsContent.substring(0, 10000);
            console.log(displayContent);
            if (logsContent.length > 10000) {
                console.log('\n... (truncated) ...\n');
            }
            console.log('\n--- END LOGS ---\n');

            return logsContent;
        } else {
            console.log('⚠️  Could not extract logs from deployment page\n');
            console.log('Deployment URL: ' + logsPageUrl + '\n');
            console.log('Try accessing the deployment page directly for detailed logs.\n');
            return null;
        }
    }

    async viewLatestDeploymentLogs() {
        try {
            const email = process.env.U;
            const password = process.env.P;

            if (!email || !password) {
                console.error('❌ Missing credentials');
                console.error('Set U and P environment variables with your Coolify login details\n');
                process.exit(1);
            }

            console.log('═════════════════════════════════════════\n');
            console.log('🚀 Coolify Deployment Logs Viewer\n');
            console.log('═════════════════════════════════════════\n');

            // Step 1: Login
            await this.login(email, password);

            // Step 2: Get deployments list
            const deploymentIds = await this.getDeploymentsList();

            if (deploymentIds.length === 0) {
                console.log('❌ No deployments found\n');
                return;
            }

            // Step 3: Get latest deployment details
            const latestDeploymentId = deploymentIds[0];
            const deploymentDetails = await this.getDeploymentDetails(latestDeploymentId);

            // Step 4: Fetch and display logs
            await this.getDeploymentLogs(latestDeploymentId);

            console.log('✅ Done!\n');

        } catch (error) {
            console.error('❌ Error:', error.message);
            process.exit(1);
        }
    }
}

// Run if called directly
if (require.main === module) {
    // Parse command line arguments
    const args = process.argv.slice(2);
    let baseURL = null;
    let command = 'logs';

    // Parse arguments: coolify-logs <url> [command]
    if (args.length > 0) {
        if (args[0] === 'list') {
            command = 'list';
            baseURL = process.env.COOLIFY_URL;
        } else if (args[0].startsWith('http')) {
            baseURL = args[0];
            if (args[1]) {
                command = args[1];
            }
        } else {
            command = args[0];
            baseURL = process.env.COOLIFY_URL;
        }
    }

    const viewer = new CoolifyLogs(baseURL);

    if (command === 'list') {
        // For list command, we need to auto-discover project/environment/application
        viewer.viewLatestDeploymentLogs();
    } else {
        viewer.viewLatestDeploymentLogs();
    }
}

module.exports = CoolifyLogs;
