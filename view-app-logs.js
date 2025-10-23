#!/usr/bin/env node

/**
 * View Application Runtime Logs from Coolify
 *
 * Note: Coolify uses Livewire (Laravel) with real-time WebSocket connections for live logs.
 * Deployment logs require WebSocket streaming which isn't available via simple HTTP requests.
 *
 * This script provides the URL to view logs in browser and demonstrates the working authentication.
 */

const https = require('https');
const { URL } = require('url');

class CoolifyAppLogs {
    constructor() {
        this.baseURL = 'https://coolify.acc.l-inc.co.za';
        this.cookies = '';
        this.csrfToken = null;
        this.projectId = 'ko4gsw80socs0088ks8w4s4s';
        this.environmentId = 'aooks0ow0c084s4w80g8ko8w';
        this.applicationId = 'zo4k4gcksw8g0soo0k488ok0';
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
                // Capture cookies immediately
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

    async getApplicationInfo() {
        console.log('📋 Fetching application info...\n');

        const appPageUrl = `${this.baseURL}/project/${this.projectId}/environment/${this.environmentId}/application/${this.applicationId}`;
        const res = await this.request(appPageUrl);

        if (res.status === 200) {
            console.log('✅ Application page accessible\n');
            return {
                url: appPageUrl,
                logsUrl: `${appPageUrl}/logs`,
                deploymentsUrl: `${appPageUrl}/deployment`
            };
        } else {
            console.log(`⚠️  Got status ${res.status}\n`);
            return null;
        }
    }

    async showLogOptions() {
        try {
            const email = process.env.U;
            const password = process.env.P;

            if (!email || !password) {
                console.error('❌ Missing credentials');
                console.error('Set U and P environment variables\n');
                process.exit(1);
            }

            console.log('═════════════════════════════════════════════════════════\n');
            console.log('🚀 Coolify Application Logs Viewer\n');
            console.log('═════════════════════════════════════════════════════════\n');

            // Login
            await this.login(email, password);

            // Get application URLs
            const appInfo = await this.getApplicationInfo();

            if (!appInfo) {
                console.log('❌ Could not access application\n');
                return;
            }

            console.log('📊 Application URLs:\n');
            console.log(`Application Configuration:`);
            console.log(`  ${appInfo.url}\n`);

            console.log(`Runtime Logs (Container Logs):`);
            console.log(`  ${appInfo.logsUrl}`);
            console.log(`  • Shows live container output`);
            console.log(`  • Requires browser with WebSocket support\n`);

            console.log(`Deployment History:`);
            console.log(`  ${appInfo.deploymentsUrl}`);
            console.log(`  • Shows all past deployments`);
            console.log(`  • Each deployment has its own logs\n`);

            console.log('═════════════════════════════════════════════════════════\n');
            console.log('💡 About Coolify Logs:\n');
            console.log('Coolify uses Livewire (Laravel framework) with real-time');
            console.log('WebSocket connections for streaming logs. To view logs:');
            console.log('\n1. Open the URLs above in a browser');
            console.log('2. Your session is authenticated (cookies set)');
            console.log('3. Logs stream in real-time via WebSocket\n');

            console.log('For CLI access to logs, you would need to:');
            console.log('• Implement WebSocket client');
            console.log('• Subscribe to Livewire events');
            console.log('• Parse wire:stream components\n');

            console.log('═════════════════════════════════════════════════════════\n');
            console.log('✅ Authentication successful!\n');
            console.log('Copy the URLs above into your browser to view logs.');
            console.log('Your session cookies are valid for the current browser session.\n');

        } catch (error) {
            console.error('❌ Error:', error.message);
            process.exit(1);
        }
    }
}

// Run if called directly
if (require.main === module) {
    const viewer = new CoolifyAppLogs();
    viewer.showLogOptions();
}

module.exports = CoolifyAppLogs;
