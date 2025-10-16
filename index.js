#!/usr/bin/env node

/**
 * Coolify Deploy CLI - Main Entry Point
 * Complete deployment automation for Coolify without Playwright
 */

const { spawn } = require('child_process');
const path = require('path');

const CLI_TOOLS = {
    'complete': 'coolify-complete-cli.cjs',
    'api': 'coolify-api-deploy-cli.cjs',
    'real': 'coolify-real-api-cli.cjs',
    'fixed': 'coolify-fixed-deploy-cli.cjs'
};

function showMainHelp() {
    console.log('🎯 Coolify Deploy CLI - Complete Deployment Automation');
    console.log('');
    console.log('Usage: npx coolify-deploy <tool> <command>');
    console.log('');
    console.log('Available Tools:');
    console.log('  complete     - Complete deployment workflow demonstration (recommended)');
    console.log('  api          - Fast API-based deployment simulation');
    console.log('  real         - Real HTTP API calls to Coolify');
    console.log('  fixed        - Fixed authentication with CSRF handling');
    console.log('');
    console.log('Commands (for each tool):');
    console.log('  deploy       - Execute deployment');
    console.log('  help         - Show tool-specific help');
    console.log('');
    console.log('Examples:');
    console.log('  npx coolify-deploy complete deploy    # Complete deployment demo');
    console.log('  npx coolify-deploy api deploy         # API simulation');
    console.log('  npx coolify-deploy real deploy        # Real API calls');
    console.log('  npx coolify-deploy complete help      # Tool-specific help');
    console.log('');
    console.log('Quick Start:');
    console.log('  # Set credentials');
    console.log('  export U="your-coolify-email"');
    console.log('  export P="your-coolify-password"');
    console.log('');
    console.log('  # Deploy with complete workflow');
    console.log('  npx coolify-deploy complete deploy');
    console.log('');
    console.log('Features:');
    console.log('  ✅ Complete deployment workflow automation');
    console.log('  ✅ No Playwright or browser automation required');
    console.log('  ✅ Real Coolify server interaction');
    console.log('  ✅ GitHub repository deployment');
    console.log('  ✅ Domain configuration and SSL setup');
    console.log('  ✅ Health monitoring and verification');
    console.log('  ✅ Professional CLI interface');
    console.log('');
    console.log('Repository: https://github.com/lanmower/coolify-cli-test-app-1760614765');
    console.log('Documentation: See individual tool help for more details');
}

function runTool(toolName, command) {
    const toolPath = CLI_TOOLS[toolName];

    if (!toolPath) {
        console.error(`❌ Unknown tool: ${toolName}`);
        console.error('Available tools:', Object.keys(CLI_TOOLS).join(', '));
        process.exit(1);
    }

    const fullPath = path.join(__dirname, toolPath);

    console.log(`🚀 Running Coolify Deploy CLI - ${toolName} tool`);
    console.log('');

    const child = spawn('node', [fullPath, command], {
        stdio: 'inherit',
        cwd: __dirname
    });

    child.on('exit', (code) => {
        process.exit(code);
    });

    child.on('error', (error) => {
        console.error('❌ Error running tool:', error.message);
        process.exit(1);
    });
}

function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        showMainHelp();
        return;
    }

    const [toolName, command] = args;

    if (toolName === 'help' || toolName === '--help' || toolName === '-h') {
        showMainHelp();
        return;
    }

    if (!command) {
        console.error('❌ Missing command');
        console.error(`Usage: npx coolify-deploy ${toolName} <command>`);
        console.error('Run "npx coolify-deploy help" for more information');
        process.exit(1);
    }

    runTool(toolName, command);
}

if (require.main === module) {
    main();
}

module.exports = { CLI_TOOLS, runTool, showMainHelp };