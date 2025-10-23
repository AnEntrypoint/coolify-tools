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
        // Support multiple ways to specify Coolify URL
        this.baseURL = baseURL ||
                      process.env.COOLIFY_URL ||
                      process.env.COOLIFY_BASE_URL ||
                      process.env.COOLIFY_HOST ||
                      'https://coolify.acc.l-inc.co.za';

        // Ensure URL has protocol
        if (!this.baseURL.startsWith('http://') && !this.baseURL.startsWith('https://')) {
            this.baseURL = 'https://' + this.baseURL;
        }

        // Remove trailing slash
        this.baseURL = this.baseURL.replace(/\/$/, '');

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
                rejectUnauthorized: false, // Allow self-signed certificates
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
        console.log(`🔐 Logging in to ${this.baseURL}...`);

        try {
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
        } catch (error) {
            if (error.code === 'ENOTFOUND') {
                throw new Error(`Could not resolve Coolify server: ${this.baseURL}\n\n` +
                    `Please specify your Coolify URL using one of these methods:\n` +
                    `  1. Command line: coolify-logs https://your-coolify-url\n` +
                    `  2. Environment variable: export COOLIFY_URL=https://your-coolify-url\n` +
                    `  3. Environment variable: export COOLIFY_HOST=your-coolify-url\n\n` +
                    `Example: coolify-logs https://coolify.example.com`);
            }
            throw error;
        }
    }


    async listAllResources() {
        console.log('📋 Listing all available resources with domains...\n');

        try {
            // Try /dashboard first, then fall back to root
            let dashboardRes = await this.request(`${this.baseURL}/dashboard`);
            if (!dashboardRes.body || dashboardRes.body.includes('404')) {
                dashboardRes = await this.request(`${this.baseURL}/`);
            }

            // Extract all projects with their details
            const projectRegex = /\/project\/([a-z0-9]+)\/environment\/([a-z0-9]+)/g;
            let match;
            const projects = {};

            while ((match = projectRegex.exec(dashboardRes.body)) !== null) {
                const projectId = match[1];
                const envId = match[2];
                if (!projects[projectId]) {
                    projects[projectId] = {
                        id: projectId,
                        name: 'Unknown Project',
                        environments: []
                    };
                }
                if (!projects[projectId].environments.includes(envId)) {
                    projects[projectId].environments.push(envId);
                }
            }

            // For each project and environment, get applications and their domains
            let resourceCount = 0;

            for (const [projId, project] of Object.entries(projects)) {
                console.log(`📁 ${project.name || 'Unknown Project'}`);

                for (const envId of project.environments) {
                    // Get applications for this environment
                    try {
                        const projectRes = await this.request(`${this.baseURL}/project/${projId}/environment/${envId}`);

                        // Extract applications JSON data
                        const jsonMatch = projectRes.body.match(/applications:\s*JSON\.parse\('([^']+)'\)/);
                        if (jsonMatch) {
                            try {
                                // Decode the JSON string (handle unicode escapes and forward slashes)
                                const jsonStr = jsonMatch[1]
                                    .replace(/\\u0022/g, '"')
                                    .replace(/\\\\\//g, '/')
                                    .replace(/\\u005c/g, '\\');

                                const apps = JSON.parse(jsonStr);

                                // Extract domains from each application's fqdn field
                                apps.forEach(app => {
                                    if (app.fqdn) {
                                        // Extract domain from "https://domain.com" format (after JSON parsing)
                                        const domainMatch = app.fqdn.match(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/i);
                                        if (domainMatch) {
                                            const domain = domainMatch[1].toLowerCase();
                                            console.log(`   🌐 ${domain}`);
                                            resourceCount++;
                                        }
                                    }
                                });
                            } catch (parseErr) {
                                // Silently skip if JSON parsing fails
                            }
                        }
                    } catch (e) {
                        console.log(`   ⚠️  Could not fetch environment: ${e.message}`);
                    }
                }
                console.log();
            }

            console.log(`✅ Found ${resourceCount} deployable applications\n`);
            return true;
        } catch (e) {
            console.error('Error listing resources:', e.message);
            return false;
        }
    }

    async discoverResources() {
        console.log('🔍 Discovering projects, environments, and applications...');

        try {
            // Try /dashboard first, then fall back to root
            let dashboardRes = await this.request(`${this.baseURL}/dashboard`);
            if (!dashboardRes.body || dashboardRes.body.includes('404')) {
                dashboardRes = await this.request(`${this.baseURL}/`);
            }

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

        // Extract deployments with their timestamps for proper ordering
        const deployments = [];

        // Look for deployment entries in the HTML
        // Pattern: deployment ID followed by status and timestamps
        const deploymentPattern = /\/deployment\/([a-z0-9]{24})[^<]*(?:<[^>]*>)*([^<]*(?:Success|Failed|Running|Pending)[^<]*)/g;
        let match;

        while ((match = deploymentPattern.exec(res.body)) !== null) {
            const deploymentId = match[1];
            // Check if we already have this deployment
            if (!deployments.some(d => d.id === deploymentId)) {
                deployments.push({
                    id: deploymentId,
                    info: match[2]
                });
            }
        }

        // If pattern didn't work, fall back to simple ID extraction
        if (deployments.length === 0) {
            const deploymentRegex = /\/deployment\/([a-z0-9]{24})/g;
            while ((match = deploymentRegex.exec(res.body)) !== null) {
                const deploymentId = match[1];
                if (!deployments.some(d => d.id === deploymentId)) {
                    deployments.push({ id: deploymentId, info: '' });
                }
            }
        }

        console.log(`✅ Found ${deployments.length} deployments\n`);

        // Return just the IDs in order (first is latest)
        return deployments.map(d => d.id);
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

    async viewLatestDeploymentLogs(projId = null, envId = null, appId = null) {
        try {
            const email = process.env.COOLIFY_USERNAME || process.env.U;
            const password = process.env.COOLIFY_PASSWORD || process.env.P;

            if (!email || !password) {
                console.error('❌ Missing credentials');
                console.error('Set COOLIFY_USERNAME and COOLIFY_PASSWORD environment variables with your Coolify login details\n');
                console.error('Or set U and P environment variables\n');
                process.exit(1);
            }

            console.log('═════════════════════════════════════════\n');
            console.log('🚀 Coolify Deployment Logs Viewer\n');
            console.log('═════════════════════════════════════════\n');

            // Step 1: Login
            await this.login(email, password);

            // Step 2: If IDs not provided, discover them
            if (!projId || !envId || !appId) {
                const discovered = await this.discoverResources();
                if (!discovered) {
                    console.error('❌ Could not discover project/environment/application IDs');
                    return;
                }
                projId = this.projectId;
                envId = this.environmentId;
                appId = this.applicationId;
            } else {
                this.projectId = projId;
                this.environmentId = envId;
                this.applicationId = appId;
            }

            // Step 3: Get deployments list
            const deploymentIds = await this.getDeploymentsList();

            if (deploymentIds.length === 0) {
                console.log('❌ No deployments found\n');
                return;
            }

            // Step 4: Get latest deployment details
            const latestDeploymentId = deploymentIds[0];
            const deploymentDetails = await this.getDeploymentDetails(latestDeploymentId);

            // Step 5: Fetch and display logs
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

    // Parse arguments: coolify-logs [<url>] [command]
    if (args.length > 0) {
        if (args[0] === 'list') {
            command = 'list';
            baseURL = process.env.COOLIFY_URL;
        } else if (args[0].startsWith('http')) {
            baseURL = args[0];
            if (args[1] === 'list') {
                command = 'list';
            } else if (args[1]) {
                command = args[1];
            }
        } else {
            command = args[0];
            baseURL = process.env.COOLIFY_URL;
        }
    }

    const viewer = new CoolifyLogs(baseURL);

    if (command === 'list') {
        // For list command, login and show all available resources with domains
        (async () => {
            try {
                const email = process.env.COOLIFY_USERNAME || process.env.U;
                const password = process.env.COOLIFY_PASSWORD || process.env.P;

                if (!email || !password) {
                    console.error('❌ Missing credentials');
                    console.error('Set COOLIFY_USERNAME and COOLIFY_PASSWORD environment variables with your Coolify login details\n');
                    console.error('Or set U and P environment variables\n');
                    process.exit(1);
                }

                await viewer.login(email, password);
                await viewer.listAllResources();
            } catch (error) {
                console.error('❌ Error:', error.message);
                process.exit(1);
            }
        })();
    } else {
        // If command looks like proj/env/app format, parse it
        let parsedProjId = null, parsedEnvId = null, parsedAppId = null;

        if (command && command.includes('/')) {
            const parts = command.split('/');
            if (parts.length === 3) {
                [parsedProjId, parsedEnvId, parsedAppId] = parts;
                viewer.viewLatestDeploymentLogs(parsedProjId, parsedEnvId, parsedAppId);
            } else {
                viewer.viewLatestDeploymentLogs();
            }
        } else {
            viewer.viewLatestDeploymentLogs();
        }
    }
}

module.exports = CoolifyLogs;
