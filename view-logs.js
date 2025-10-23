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
    constructor() {
        this.baseURL = 'https://coolify.acc.l-inc.co.za';
        this.cookies = '';
        this.csrfToken = null;
        this.projectId = 'ko4gsw80socs0088ks8w4s4s';
        this.environmentId = 'aooks0ow0c084s4w80g8ko8w';
        this.applicationId = 'zo4k4gcksw8g0soo0k488ok0'; // Running application
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

    async getDeploymentsList() {
        console.log('📋 Fetching deployments list...');

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

        // Try the logs tab URL first
        const logsTabUrl = `${this.baseURL}/project/${this.projectId}/environment/${this.environmentId}/application/${this.applicationId}/deployment/${deploymentId}/logs`;
        let res = await this.request(logsTabUrl);

        // If that doesn't work, try the main deployment page
        if (res.status === 404 || res.status === 302) {
            const logsPageUrl = `${this.baseURL}/project/${this.projectId}/environment/${this.environmentId}/application/${this.applicationId}/deployment/${deploymentId}`;
            res = await this.request(logsPageUrl);
        }

        // Try multiple strategies to extract logs

        // Strategy 1: Look for pre/code tags
        let logsContent = null;
        const preMatch = res.body.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
        if (preMatch) {
            logsContent = preMatch[1];
        }

        // Strategy 2: Look for code tags
        if (!logsContent) {
            const codeMatch = res.body.match(/<code[^>]*>([\s\S]*?)<\/code>/);
            if (codeMatch) {
                logsContent = codeMatch[1];
            }
        }

        // Strategy 3: Extract from wire:snapshot data
        if (!logsContent) {
            // Look for Livewire component data that might contain logs
            const wireMatch = res.body.match(/wire:snapshot="([^"]+)"/);
            if (wireMatch) {
                try {
                    const decoded = wireMatch[1]
                        .replace(/&quot;/g, '"')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&amp;/g, '&');
                    const wireData = JSON.parse(decoded);
                    // Check if the data contains logs
                    const dataStr = JSON.stringify(wireData);
                    if (dataStr.includes('log') && dataStr.length > 100) {
                        logsContent = dataStr.substring(0, 3000);
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        }

        // Strategy 4: Look for any text content that looks like deployment logs
        if (!logsContent) {
            const patterns = [
                /Cloning into.*?[\s\S]{100,2000}/,
                /npm install.*?[\s\S]{100,2000}/,
                /Building.*?[\s\S]{100,2000}/,
                /Deployment.*?[\s\S]{100,2000}/
            ];

            for (const pattern of patterns) {
                const match = res.body.match(pattern);
                if (match) {
                    logsContent = match[0];
                    break;
                }
            }
        }

        if (logsContent) {
            // Decode HTML entities
            logsContent = logsContent
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&#039;/g, "'")
                .replace(/<[^>]+>/g, ''); // Remove remaining HTML tags

            console.log('--- DEPLOYMENT LOGS ---\n');
            console.log(logsContent.substring(0, 3000));
            if (logsContent.length > 3000) {
                console.log('\n... (truncated) ...\n');
            }
            console.log('\n--- END LOGS ---\n');

            return logsContent;
        } else {
            console.log('⚠️  Could not extract logs from deployment page\n');
            console.log('This may require the full Livewire component data or WebSocket connection.\n');
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
    const viewer = new CoolifyLogs();
    viewer.viewLatestDeploymentLogs();
}

module.exports = CoolifyLogs;
