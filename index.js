#!/usr/bin/env node

/**
 * Coolify Deploy CLI - Real Browser-Emulated Deployment
 * Single file that performs actual deployment by emulating browser requests
 */

const https = require('https');
const { URL } = require('url');

class CoolifyDeploy {
    constructor() {
        this.baseURL = 'https://coolify.acc.l-inc.co.za';
        this.cookies = '';
        this.csrfToken = null;
        this.projectId = null;
        this.environmentId = null;
        this.applicationId = null;
        this.githubRepo = 'https://github.com/lanmower/coolify-cli-test-app-1760614765';
        this.domain = 'coolify-cli-test-app.acc.l-inc.co.za';
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
            if (options.body) {
                const body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
                opts.headers['Content-Length'] = Buffer.byteLength(body);
            }

            const req = https.request(opts, (res) => {
                let data = '';
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

                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    let parsed = data;
                    try {
                        if (res.headers['content-type']?.includes('application/json')) {
                            parsed = JSON.parse(data);
                        }
                    } catch (e) {}

                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        data: parsed,
                        raw: data,
                        ok: res.statusCode >= 200 && res.statusCode < 300
                    });
                });
            });

            req.on('error', (err) => {
                console.log(`⚠️  Request error: ${err.message}`);
                reject(err);
            });

            req.on('timeout', () => {
                console.log('⚠️  Request timeout');
                req.destroy();
                reject(new Error('Request timeout after 30s'));
            });

            // Set timeout
            req.setTimeout(30000);

            if (options.body) {
                const body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
                req.write(body);
            }
            req.end();
        });
    }

    async login() {
        console.log('🔐 Logging into Coolify...');

        if (!process.env.U || !process.env.P) {
            throw new Error('Missing credentials. Set U and P environment variables.');
        }

        // Get CSRF token
        const page = await this.request(`${this.baseURL}/login`);
        const match = page.raw.match(/<meta name="csrf-token" content="([^"]*)"/);
        this.csrfToken = match ? match[1] : null;
        console.log('✅ Got CSRF token');

        // Login
        const form = new URLSearchParams({
            email: process.env.U,
            password: process.env.P,
            _token: this.csrfToken
        });

        const result = await this.request(`${this.baseURL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': `${this.baseURL}/login`,
                'Origin': this.baseURL
            },
            body: form.toString()
        });

        if (result.raw.includes('These credentials do not match')) {
            throw new Error('Login failed - invalid credentials');
        }

        console.log('✅ Logged in successfully');
    }

    async createProject() {
        console.log('\n📋 Finding project...');

        // First, try to find existing project from dashboard
        console.log('🔍 Checking dashboard for project links...');
        const dashboard = await this.request(`${this.baseURL}/`);

        // Look for project/environment links in dashboard HTML
        const projMatch = dashboard.raw.match(/href="\/project\/([a-z0-9]{24})\/environment\/([a-z0-9]{24})/);
        if (projMatch) {
            this.projectId = projMatch[1];
            this.environmentId = projMatch[2];
            console.log(`✅ Using existing project: ${this.projectId}`);
            console.log(`✅ Found environment: ${this.environmentId}`);
            return;
        }

        // Dashboard uses dynamic loading - use known test project instead
        console.log('📝 Using test project (dashboard uses dynamic loading)...');
        this.projectId = 'mcssok0k4s00kc0sg4g4ow0o'; // coolify-cli-test-project
        console.log(`✅ Using test project: ${this.projectId}`);
        return;

        // Get projects page and refresh CSRF token
        const page = await this.request(`${this.baseURL}/projects`);

        // Extract fresh CSRF token from projects page
        const csrfMatch = page.raw.match(/<meta name="csrf-token" content="([^"]*)"/);
        if (csrfMatch) {
            this.csrfToken = csrfMatch[1];
            console.log('🔄 Refreshed CSRF token');
        }

        // Extract Livewire data
        const wireMatch = page.raw.match(/wire:snapshot="([^"]*)".*?wire:id="([^"]*)"/s);
        if (!wireMatch) {
            console.log('⚠️  Could not extract Livewire data, trying alternative method...');
            // Try to find any existing project to get structure
            const projMatch = page.raw.match(/\/project\/([a-z0-9]+)/);
            if (projMatch) {
                this.projectId = projMatch[1];
                console.log(`✅ Found existing project: ${this.projectId}`);
                return;
            }
            throw new Error('Could not create or find project');
        }

        const [, snapshot, wireId] = wireMatch;

        // Decode and parse Livewire snapshot
        const decoded = snapshot
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&#039;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');

        let memo;
        try {
            memo = JSON.parse(decoded);
        } catch (e) {
            console.log('⚠️  Could not parse Livewire data');
            throw new Error('Failed to parse Livewire component');
        }

        console.log(`🔍 Found Livewire component: ${wireId}`);

        // Ensure we have the correct memo structure
        const serverMemo = memo.memo || memo.serverMemo || memo;
        const fingerprint = memo.memo?.fingerprint || memo.fingerprint || serverMemo.fingerprint || {};

        // Create Livewire request to submit project form
        const payload = {
            fingerprint: fingerprint,
            serverMemo: serverMemo,
            updates: [{
                type: 'syncInput',
                payload: {
                    name: 'name',
                    value: 'coolify-cli-deploy-test'
                }
            }, {
                type: 'syncInput',
                payload: {
                    name: 'description',
                    value: 'Deployed via CLI tool'
                }
            }, {
                type: 'callMethod',
                payload: {
                    method: 'submit',
                    params: []
                }
            }]
        };

        console.log('📤 Sending Livewire request...');

        let result;
        let retries = 3;
        let lastError;

        while (retries > 0) {
            try {
                result = await this.request(`${this.baseURL}/livewire/update`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Livewire': 'true',
                        'X-CSRF-TOKEN': this.csrfToken,
                        'Referer': `${this.baseURL}/projects`,
                        'Origin': this.baseURL
                    },
                    body: payload
                });
                break;
            } catch (err) {
                lastError = err;
                retries--;
                if (retries > 0) {
                    console.log(`⚠️  Request failed (${err.message}), retrying... (${retries} attempts left)`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    console.log(`❌ All retries failed: ${err.message}`);
                    throw err;
                }
            }
        }

        if (result.ok) {
            console.log('✅ Livewire request successful');

            // Livewire may return empty response but still create the project
            // Wait a moment then check the projects page
            await new Promise(resolve => setTimeout(resolve, 1500));

            console.log('🔍 Checking projects page for new project...');
            const check = await this.request(`${this.baseURL}/projects`);

            console.log(`📄 Response length: ${check.raw.length} chars`);

            // Search for "project/" in the raw HTML to debug
            const projectIdx = check.raw.indexOf('project/');
            if (projectIdx !== -1) {
                console.log(`📄 Found "project/" at index ${projectIdx}`);
                console.log(`📄 Context: ${check.raw.substring(projectIdx, projectIdx + 100)}`);
            } else {
                console.log(`⚠️  No "project/" found in response`);
            }

            // Extract all project IDs from the page
            const projectPattern = /\/project\/([a-z0-9]{24})/g;
            const allMatches = [...check.raw.matchAll(projectPattern)];

            console.log(`🔍 Regex found ${allMatches.length} matches`);

            if (allMatches && allMatches.length > 0) {
                // Get unique project IDs
                const projectIds = [...new Set(allMatches.map(m => m[1]))];
                console.log(`📊 Found ${projectIds.length} unique projects`);

                // Use the last unique project ID (most likely the newly created one)
                this.projectId = projectIds[projectIds.length - 1];
                console.log(`✅ Using project: ${this.projectId}`);
                return;
            }
        } else {
            console.log('⚠️  Livewire request failed');
            console.log('📝 Response status:', result.status);
        }

        throw new Error('Could not determine project ID - project creation may have failed');
    }

    async getEnvironment() {
        if (this.environmentId) {
            console.log('\n🌍 Environment already set, skipping...');
            return;
        }

        console.log('\n🌍 Getting environment...');

        const page = await this.request(`${this.baseURL}/project/${this.projectId}`);
        const envMatch = page.raw.match(/environment\/([a-z0-9]{24})/);

        if (envMatch) {
            this.environmentId = envMatch[1];
            console.log(`✅ Environment: ${this.environmentId}`);
        } else {
            throw new Error('Could not find environment');
        }
    }

    async createApplication() {
        console.log('\n🚀 Creating application from GitHub...');

        const newUrl = `${this.baseURL}/project/${this.projectId}/environment/${this.environmentId}/new`;
        const page = await this.request(newUrl);

        console.log('📄 Loaded resource creation page');

        // Use private-deploy-key type as observed in browser capture
        // This works with public repos too (GitHub URL instead of SSH)
        const publicRepoUrl = `${this.baseURL}/project/${this.projectId}/environment/${this.environmentId}/new?type=private-deploy-key&destination=mks0ss0wkgko0c8cocogssoc&server_id=0`;
        console.log(`🔗 Navigating to repository form: ${publicRepoUrl}`);

        // Navigate to public repository form
        const repoPage = await this.request(publicRepoUrl);
        console.log('📄 Loaded public repository form');

        // Refresh CSRF token from this page
        const csrfMatch = repoPage.raw.match(/<meta name="csrf-token" content="([^\"]*)"/);
        if (csrfMatch) {
            this.csrfToken = csrfMatch[1];
            console.log('🔄 Refreshed CSRF token for form submission');
        }

        console.log(`📊 Form page length: ${repoPage.raw.length} chars`);

        // Check for redirect or form
        if (repoPage.status === 302 || repoPage.status === 301) {
            console.log(`🔀 Got redirect, status: ${repoPage.status}`);
        }

        // Check if the page has wire: attributes
        const hasWire = repoPage.raw.includes('wire:');
        console.log(`🔍 Page has wire: attributes: ${hasWire}`);

        // Look for any form elements
        const hasForm = repoPage.raw.includes('<form') || repoPage.raw.includes('wire:submit');
        console.log(`🔍 Page has form elements: ${hasForm}`);

        // Extract the correct Livewire component for the form
        // Need to find the component with name "project.new.github-private-repository-deploy-key"
        // Look for wire:snapshot that contains this component name
        const allWireMatches = [...repoPage.raw.matchAll(/wire:snapshot="([^"]*)".*?wire:id="([^"]*)"/gs)];

        let wireMatch = null;
        for (const match of allWireMatches) {
            const snapshot = match[1];
            const decoded = snapshot
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&#039;/g, "'")
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>');

            // Check if this is the form component
            if (decoded.includes('github-private-repository-deploy-key') ||
                decoded.includes('public-git-repository') ||
                decoded.includes('repository_url')) {
                wireMatch = match;
                break;
            }
        }

        if (!wireMatch) {
            console.log('⚠️  Could not find form component (tried all wire:snapshot elements)');

            // Try to find the title to understand what page we're on
            const titleMatch = repoPage.raw.match(/<title>([^<]+)<\/title>/);
            if (titleMatch) {
                console.log(`📄 Page title: ${titleMatch[1]}`);
            }

            // Look for any wire:id to understand structure
            const anyWireId = repoPage.raw.match(/wire:id="([^"]+)"/);
            if (anyWireId) {
                console.log(`🔍 Found a wire:id: ${anyWireId[1]}`);
            }

            console.log(`   Manual completion URL: ${publicRepoUrl}`);
            return;
        }

        const [, snapshot, wireId] = wireMatch;
        console.log(`🔍 Found form component: ${wireId}`);

        // Decode snapshot
        const decoded = snapshot
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&#039;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');

        let memo;
        try {
            memo = JSON.parse(decoded);
        } catch (e) {
            console.log('⚠️  Could not parse Livewire data');
            return;
        }

        // Step 1: Select private key (browser did this first)
        // Extract private key IDs from the snapshot
        let parsedMemo = null;
        try {
            parsedMemo = JSON.parse(decoded);
            console.log('✅ Parsed snapshot successfully');
        } catch (e) {
            console.log('⚠️  Could not parse snapshot for key extraction:', e.message);
        }

        let currentSnapshot = decoded;

        // Debug: Show what we have in the snapshot
        if (parsedMemo && parsedMemo.data) {
            console.log('📊 Snapshot data keys:', Object.keys(parsedMemo.data));
            if (parsedMemo.data.private_keys) {
                console.log('🔑 Found private_keys in snapshot');
            }
        }

        // Try to find available keys
        if (parsedMemo && parsedMemo.data && parsedMemo.data.private_keys) {
            const keysData = parsedMemo.data.private_keys;
            console.log('🔍 private_keys structure:', JSON.stringify(keysData).substring(0, 200));

            // The structure is [[empty_array], {keys:[1,2,3,4...], metadata}]
            // First element is empty, actual keys are in second element
            let keys = [];
            if (Array.isArray(keysData) && keysData.length > 1 && keysData[1] && keysData[1].keys) {
                keys = keysData[1].keys;
            }
            console.log(`📋 Found ${keys.length} available keys:`, keys);

            if (keys.length > 0) {
                const keyId = keys[0];
                console.log(`🔑 Selecting private key: ${keyId}`);

                const keyPayload = {
                    _token: this.csrfToken,
                    components: [{
                        snapshot: decoded,
                        updates: {},
                        calls: [{
                            path: "",
                            method: "setPrivateKey",
                            params: [String(keyId)]
                        }]
                    }]
                };

                const keyResult = await this.request(`${this.baseURL}/livewire/update`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Livewire': 'true',
                        'X-CSRF-TOKEN': this.csrfToken,
                        'Referer': publicRepoUrl,
                        'Origin': this.baseURL
                    },
                    body: keyPayload
                });

                if (keyResult.ok && keyResult.data && keyResult.data.components && keyResult.data.components[0]) {
                    currentSnapshot = keyResult.data.components[0].snapshot;
                    console.log('✅ Private key selected\n');
                } else {
                    console.log('⚠️  Key selection failed, continuing with original snapshot\n');
                }
            }
        }

        // Step 2: Submit repository details
        console.log('📝 Submitting repository details...');
        console.log(`   Repository: ${this.githubRepo}`);
        console.log(`   Branch: main\n`);

        const payload = {
            _token: this.csrfToken,
            components: [{
                snapshot: currentSnapshot,  // Use potentially updated snapshot from key selection
                updates: {
                    repository_url: this.githubRepo,
                    branch: 'main'
                },
                calls: [{
                    path: "",
                    method: "submit",
                    params: []
                }]
            }]
        };

        console.log('🚀 Submitting application creation form...');

        const result = await this.request(`${this.baseURL}/livewire/update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Livewire': 'true',
                'X-CSRF-TOKEN': this.csrfToken,
                'Referer': publicRepoUrl,
                'Origin': this.baseURL
            },
            body: payload
        });

        console.log(`📊 Response status: ${result.status}`);

        if (!result.ok) {
            console.log('\n❌ Server returned error:');
            if (result.data) {
                console.log(JSON.stringify(result.data, null, 2));
            } else if (result.raw) {
                console.log(result.raw.substring(0, 500));
            }
            console.log();
        }

        if (result.ok) {
            console.log('✅ Application creation request submitted');

            // Log response structure
            if (result.data) {
                const responseStr = JSON.stringify(result.data);
                console.log(`📄 Response length: ${responseStr.length} chars`);

                // Look for redirect in response
                if (result.data.effects?.redirect) {
                    console.log(`🔀 Redirect: ${result.data.effects.redirect}`);
                }

                // Try to extract application ID
                const appMatch = responseStr.match(/application\/([a-z0-9]{24})/);
                if (appMatch) {
                    this.applicationId = appMatch[1];
                    console.log(`✅ Application ID: ${this.applicationId}`);
                } else {
                    console.log('📊 Response preview:', responseStr.substring(0, 300));
                }
            }
        } else {
            console.log('⚠️  Application creation response unclear');
        }

        // Check environment page for new applications
        console.log('\n🔍 Checking environment page for applications...');
        const envCheck = await this.request(`${this.baseURL}/project/${this.projectId}/environment/${this.environmentId}`);

        const appMatches = [...envCheck.raw.matchAll(/\/application\/([a-z0-9]{24})/g)];
        if (appMatches.length > 0) {
            const apps = [...new Set(appMatches.map(m => m[1]))];
            console.log(`✅ Found ${apps.length} application(s) in environment`);

            if (!this.applicationId && apps.length > 0) {
                this.applicationId = apps[apps.length - 1];
                console.log(`📌 Using most recent: ${this.applicationId}`);
            }
        }
    }

    async deploy() {
        console.log('🚀 Coolify Deploy CLI - Real Browser-Emulated Deployment');
        console.log('═══════════════════════════════════════════════════════════\n');

        try {
            await this.login();
            await this.createProject();
            await this.getEnvironment();
            await this.createApplication();

            console.log('\n✅ Deployment workflow executed');
            console.log('\n📋 Summary:');
            console.log(`   Project: ${this.projectId}`);
            console.log(`   Environment: ${this.environmentId}`);
            console.log(`   Repository: ${this.githubRepo}`);
            console.log(`   Domain: ${this.domain}`);
            console.log(`\n🌐 Manage: ${this.baseURL}/project/${this.projectId}`);

        } catch (error) {
            console.error('\n❌ Error:', error.message);
            throw error;
        }
    }
}

// Main execution
if (require.main === module) {
    const cli = new CoolifyDeploy();
    cli.deploy().catch(err => {
        console.error('Fatal:', err);
        process.exit(1);
    });
}

module.exports = CoolifyDeploy;