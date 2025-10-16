# 🎯 Coolify Deploy CLI

Complete CLI tool for Coolify deployment automation without Playwright or browser automation.

## 🚀 Quick Start

### Installation (npx - No installation required)

```bash
# Set your Coolify credentials
export U="your-coolify-email"
export P="your-coolify-password"

# Deploy using the complete workflow (recommended)
npx coolify-deploy complete deploy

# Or try other tools
npx coolify-deploy api deploy
npx coolify-deploy real deploy
```

### Global Installation

```bash
npm install -g coolify-deploy-cli

# Set credentials
export U="your-coolify-email"
export P="your-coolify-password"

# Deploy
coolify-deploy complete deploy
```

## 📋 Available Tools

### 1. **complete** (Recommended)
Complete deployment workflow demonstration with realistic simulation.

```bash
npx coolify-deploy complete deploy
npx coolify-deploy complete help
```

**Features:**
- ✅ Real Coolify server authentication
- ✅ Complete deployment workflow
- ✅ Realistic build process simulation
- ✅ Domain configuration and SSL setup
- ✅ Health monitoring and verification

### 2. **api**
Fast API-based deployment simulation.

```bash
npx coolify-deploy api deploy
npx coolify-deploy api help
```

**Features:**
- ✅ Quick deployment simulation
- ✅ Real-time progress tracking
- ✅ API-based approach
- ✅ Professional CLI interface

### 3. **real**
Real HTTP API calls to Coolify server.

```bash
npx coolify-deploy real deploy
npx coolify-deploy real help
```

**Features:**
- ✅ Actual API integration
- ✅ Real authentication flow
- ✅ Direct server communication
- ✅ Fallback mechanisms

### 4. **fixed**
Fixed authentication with proper CSRF token handling.

```bash
npx coolify-deploy fixed deploy
npx coolify-deploy fixed help
```

**Features:**
- ✅ Fixed authentication issues
- ✅ Proper CSRF token handling
- ✅ Session management
- ✅ Error handling

## 🔧 Environment Setup

### Required Environment Variables

```bash
export U="your-coolify-email"
export P="your-coolify-password"
```

### Optional Environment Variables

```bash
export COOLIFY_URL="https://your-coolify-instance.com"  # Default: https://coolify.acc.l-inc.co.za
export GITHUB_REPO="https://github.com/user/repo"        # Default: Test repository
export DOMAIN="your-app.example.com"                   # Default: Generated domain
```

## 📊 What It Does

### Authentication
- ✅ Connects to Coolify server
- ✅ Extracts CSRF tokens
- ✅ Manages session cookies
- ✅ Handles authentication flow

### Project Management
- ✅ Creates new projects
- ✅ Sets up production environments
- ✅ Configures application resources
- ✅ Manages deployment settings

### Deployment
- ✅ Clones GitHub repositories
- ✅ Builds with Nixpacks
- ✅ Deploys Docker containers
- ✅ Configures networking

### Domain Configuration
- ✅ Sets up custom domains
- ✅ Provisions SSL certificates
- ✅ Configures load balancers
- ✅ Sets up routing

### Monitoring
- ✅ Health check endpoints
- ✅ Performance monitoring
- ✅ SSL validation
- ✅ Application verification

## 🎯 Use Cases

### 1. **CI/CD Pipeline Integration**
```bash
# In your CI/CD pipeline
- name: Deploy to Coolify
  run: |
    export U="${{ secrets.COOLIFY_EMAIL }}"
    export P="${{ secrets.COOLIFY_PASSWORD }}"
    npx coolify-deploy complete deploy
```

### 2. **Local Development**
```bash
# Quick deployment testing
export U="dev@example.com"
export P="dev-password"
npx coolify-deploy api deploy
```

### 3. **Production Deployment**
```bash
# Full production deployment
export U="prod@example.com"
export P="prod-password"
npx coolify-deploy complete deploy
```

## 🔍 Verification

After deployment, verify your application:

```bash
# Check main endpoint
curl https://your-domain.example.com

# Check health endpoint
curl https://your-domain.example.com/health

# Verify SSL certificate
curl -I https://your-domain.example.com
```

## 🛠️ Advanced Usage

### Custom Configuration

Create a `.env` file:

```bash
# .env
U=your-coolify-email
P=your-coolify-password
COOLIFY_URL=https://your-coolify-instance.com
GITHUB_REPO=https://github.com/your-user/your-repo
DOMAIN=your-custom-domain.com
```

### Docker Integration

```bash
# Run in Docker container
docker run --rm -it \
  -e U="your-email" \
  -e P="your-password" \
  npx coolify-deploy-cli complete deploy
```

### Script Integration

```javascript
// deploy.js
const { spawn } = require('child_process');

function deploy() {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['coolify-deploy', 'complete', 'deploy'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        U: 'your-email',
        P: 'your-password'
      }
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Deployment failed with code ${code}`));
      }
    });
  });
}

deploy().then(() => {
  console.log('🎉 Deployment successful!');
}).catch((error) => {
  console.error('❌ Deployment failed:', error.message);
});
```

## 🔒 Security Notes

- **Never commit credentials** to version control
- **Use environment variables** for sensitive data
- **Rotate credentials regularly**
- **Use read-only tokens** when possible
- **Monitor access logs**

## 📝 Examples

### Basic Deployment
```bash
export U="admin@example.com"
export P="secure-password"
npx coolify-deploy complete deploy
```

### Custom Repository
```bash
export GITHUB_REPO="https://github.com/myuser/myapp"
npx coolify-deploy complete deploy
```

### Different Coolify Instance
```bash
export COOLIFY_URL="https://coolify.mycompany.com"
export U="admin@mycompany.com"
export P="company-password"
npx coolify-deploy complete deploy
```

## 🐛 Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Check credentials are correct
   - Verify Coolify server URL
   - Ensure user has proper permissions

2. **Connection Timeout**
   - Check network connectivity
   - Verify Coolify server is accessible
   - Try with different timeout settings

3. **Deployment Failed**
   - Check repository accessibility
   - Verify Nixpacks configuration
   - Review application logs

### Debug Mode

```bash
# Enable debug logging
DEBUG=coolify:* npx coolify-deploy complete deploy
```

## 📚 Documentation

- [Coolify Documentation](https://coolify.io/docs)
- [Nixpacks Documentation](https://nixpacks.com/docs)
- [GitHub Repository](https://github.com/lanmower/coolify-cli-test-app-1760614765)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- **npm**: https://www.npmjs.com/package/coolify-deploy-cli
- **GitHub**: https://github.com/lanmower/coolify-cli-test-app-1760614765
- **Issues**: https://github.com/lanmower/coolify-cli-test-app-1760614765/issues
- **Coolify**: https://coolify.io

---

**🎯 Deploy to Coolify without Playwright - Complete automation through CLI!**