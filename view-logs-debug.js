#!/usr/bin/env node

const CoolifyLogs = require('./view-logs');

class CoolifyLogsDebug extends CoolifyLogs {
    async getDeploymentsList() {
        console.log('📋 Fetching deployments list...');

        const deploymentsPageUrl = `${this.baseURL}/project/${this.projectId}/environment/${this.environmentId}/application/${this.applicationId}/deployment`;
        console.log(`URL: ${deploymentsPageUrl}\n`);

        const res = await this.request(deploymentsPageUrl);

        console.log('Response status:', res.status);
        console.log('Response body length:', res.body.length);
        console.log('\n--- Full HTML ---');
        console.log(res.body);
        console.log('--- End ---\n');

        // Extract deployment links from HTML
        const deploymentLinks = [];
        const deploymentRegex = /\/deployment\/([a-z0-9]{24})/g;
        let match;

        while ((match = deploymentRegex.exec(res.body)) !== null) {
            if (!deploymentLinks.includes(match[1])) {
                deploymentLinks.push(match[1]);
                console.log(`Found deployment ID: ${match[1]}`);
            }
        }

        console.log(`\n✅ Found ${deploymentLinks.length} deployments\n`);
        return deploymentLinks;
    }
}

async function debugViewer() {
    try {
        const email = process.env.U;
        const password = process.env.P;

        if (!email || !password) {
            console.error('❌ Missing credentials');
            console.error('Set U and P environment variables\n');
            process.exit(1);
        }

        console.log('═════════════════════════════════════════\n');
        console.log('🔍 Coolify Logs Viewer - DEBUG MODE\n');
        console.log('═════════════════════════════════════════\n');

        const viewer = new CoolifyLogsDebug();
        await viewer.login(email, password);
        const deploymentIds = await viewer.getDeploymentsList();

        if (deploymentIds.length > 0) {
            console.log('\nDeployment IDs found:');
            deploymentIds.forEach((id, i) => console.log(`  ${i + 1}. ${id}`));
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

debugViewer();
