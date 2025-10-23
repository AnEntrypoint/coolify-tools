#!/usr/bin/env node

const fs = require('fs');
const CoolifyLogs = require('./view-logs');

class CoolifyLogsDebug extends CoolifyLogs {
    async getDeploymentLogs(deploymentId) {
        console.log(`📜 Fetching deployment logs for ${deploymentId}...\n`);

        const logsPageUrl = `${this.baseURL}/project/${this.projectId}/environment/${this.environmentId}/application/${this.applicationId}/deployment/${deploymentId}`;
        const res = await this.request(logsPageUrl);

        console.log('Response status:', res.status);
        console.log('Response body length:', res.body.length);

        // Save full HTML to file
        fs.writeFileSync('/tmp/deployment-page.html', res.body);
        console.log('Saved full HTML to /tmp/deployment-page.html\n');

        // Show first 3000 chars
        console.log('--- First 3000 chars ---');
        console.log(res.body.substring(0, 3000));
        console.log('--- End ---\n');

        // Try multiple strategies to extract logs

        // Strategy 1: Look for pre/code tags
        let logsContent = null;
        const preMatch = res.body.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
        if (preMatch) {
            console.log('✓ Found <pre> tag');
            logsContent = preMatch[1];
        }

        // Strategy 2: Look for code tags
        if (!logsContent) {
            const codeMatch = res.body.match(/<code[^>]*>([\s\S]*?)<\/code>/);
            if (codeMatch) {
                console.log('✓ Found <code> tag');
                logsContent = codeMatch[1];
            }
        }

        // Strategy 3: Look for wire:stream or livewire data
        if (!logsContent) {
            if (res.body.includes('wire:stream') || res.body.includes('livewire')) {
                console.log('⚠️  Page uses Livewire components for logs');
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
                .replace(/<[^>]+>/g, '');

            console.log('\n--- DEPLOYMENT LOGS ---\n');
            console.log(logsContent.substring(0, 3000));
            if (logsContent.length > 3000) {
                console.log('\n... (truncated) ...\n');
            }
            console.log('\n--- END LOGS ---\n');

            return logsContent;
        } else {
            console.log('⚠️  Could not extract logs from deployment page\n');
            console.log('Check /tmp/deployment-page.html for full HTML\n');
            return null;
        }
    }
}

async function debugViewer() {
    try {
        const email = process.env.U;
        const password = process.env.P;

        if (!email || !password) {
            console.error('❌ Missing credentials');
            process.exit(1);
        }

        console.log('═══════════════════════════════════\n');
        console.log('🔍 Logs Viewer - DEBUG MODE 2\n');
        console.log('═══════════════════════════════════\n');

        const viewer = new CoolifyLogsDebug();
        await viewer.login(email, password);
        const deploymentIds = await viewer.getDeploymentsList();

        if (deploymentIds.length === 0) {
            console.log('❌ No deployments found\n');
            return;
        }

        const latestId = deploymentIds[0];
        const details = await viewer.getDeploymentDetails(latestId);
        await viewer.getDeploymentLogs(latestId);

        console.log('\n✅ Done!\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

debugViewer();
