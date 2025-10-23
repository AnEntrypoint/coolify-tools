# Coolify Tools

Comprehensive CLI toolset for automating Coolify deployments and viewing deployment logs. Deploy applications from GitHub to your Coolify instance and monitor your deployments.

## Features

- ✅ **Pure HTTP/Livewire Implementation** - No Playwright, no browser automation
- ✅ **Complete Workflow** - Authentication, project selection, application creation
- ✅ **Private Key Management** - Automatic SSH key selection for private repositories
- ✅ **GitHub Integration** - Deploy from GitHub repositories (public or private)
- ✅ **Session Management** - Proper cookie and CSRF token handling
- ✅ **Real Deployment** - Creates actual Coolify applications programmatically

## Installation

### Global Installation

```bash
npm install -g coolify-tools
```

### Local Installation

```bash
npm install coolify-tools
```

### From Source

```bash
git clone https://github.com/AnEntrypoint/coolify-tools.git
cd coolify-tools
npm install -g .
```

## Usage

### Prerequisites

1. A running Coolify instance
2. Valid Coolify credentials
3. A GitHub repository to deploy

### Configuration

Set your Coolify credentials as environment variables:

```bash
export U="your-email@example.com"
export P="your-password"
```

### Basic Usage

The CLI requires configuration of the following values in `index.js`:

- `baseURL` - Your Coolify instance URL
- `projectId` - Your Coolify project ID
- `environmentId` - Your environment ID
- `destination` - Deployment destination ID
- `serverId` - Server ID
- `githubRepo` - GitHub repository URL
- `domain` - Domain for your application

Run the CLI:

```bash
coolify-tools
```

View deployment logs:

```bash
coolify-logs <coolify-url> list
coolify-logs <coolify-url> <resource-id>
```

Or directly:

```bash
node index.js
```

## How It Works

The CLI implements the complete Coolify deployment workflow:

### 1. Authentication
- Fetches CSRF token from login page
- Authenticates with email/password
- Maintains session cookies

### 2. Form Discovery
- Navigates to resource creation page
- Extracts Livewire component snapshots
- Identifies the correct form component

### 3. Private Key Selection
- Discovers available SSH private keys
- Selects the first available key
- Updates component state

### 4. Application Creation
- Submits repository URL and branch
- Creates Coolify application
- Extracts application ID from response

### Technical Details

#### Livewire Protocol

The CLI communicates with Coolify using the Livewire wire protocol:

```javascript
{
  _token: "csrf-token",
  components: [{
    snapshot: "component-state-json",
    updates: {
      repository_url: "https://github.com/...",
      branch: "main"
    },
    calls: [{
      path: "",
      method: "submit",
      params: []
    }]
  }]
}
```

#### Component Discovery

The CLI searches for Livewire components by:
1. Extracting all `wire:snapshot` attributes
2. Decoding HTML entities
3. Parsing JSON snapshots
4. Finding components matching form criteria

#### Key Selection Logic

Private keys are stored in Livewire component data as:

```javascript
{
  private_keys: [
    [],
    {
      keys: [1, 2, 3, 4, 5, 6],
      class: "Illuminate\\Database\\Eloquent\\Collection",
      modelClass: "App\\Models\\PrivateKey"
    }
  ]
}
```

The CLI extracts `keysData[1].keys` and calls `setPrivateKey(keyId)`.

## Development

### Project Structure

```
coolify-tools/
├── index.js          # Main CLI implementation (coolify-tools command)
├── view-logs.js      # Log viewer implementation (coolify-logs command)
├── view-app-logs.js  # Application log viewer
├── package.json      # Package configuration
├── LICENSE          # MIT License
└── README.md        # This file
```

### Testing

To test the CLI:

```bash
# Set credentials
export U="your-email"
export P="your-password"

# Run
node index.js
```

### Debugging

The CLI provides verbose console output:

- 🔐 Authentication steps
- 📋 Project/environment discovery
- 🔑 Private key selection
- 📝 Form submission
- ✅ Success indicators
- ❌ Error messages

## Deployment Workflow

```
┌─────────────────┐
│  Login          │ ← Fetch CSRF token, authenticate
└────────┬────────┘
         │
┌────────▼────────┐
│  Navigate       │ ← Get project/environment
└────────┬────────┘
         │
┌────────▼────────┐
│  Load Form      │ ← Extract Livewire components
└────────┬────────┘
         │
┌────────▼────────┐
│  Select Key     │ ← Call setPrivateKey(id)
└────────┬────────┘
         │
┌────────▼────────┐
│  Submit Repo    │ ← Send repository_url + branch
└────────┬────────┘
         │
┌────────▼────────┐
│  Application    │ ← Extract application ID
│  Created ✅     │
└─────────────────┘
```

## Requirements

- Node.js >= 16.0.0
- Access to a Coolify instance
- Valid Coolify credentials

## Troubleshooting

### 500 Errors

If you get 500 errors like:

```
Unable to set component data. Public property [$repository_url] not found
```

This means the wrong Livewire component was selected. The CLI now:
- Searches all wire:snapshot elements
- Filters for components containing form-related data
- Uses the correct `github-private-repository-deploy-key` component

### Authentication Failures

Ensure:
- `U` and `P` environment variables are set
- Credentials are correct for your Coolify instance
- Your Coolify instance is accessible

### No Applications Created

Check:
- Private key was selected (look for "🔑 Selecting private key" in output)
- Form submission returned 200 OK
- Application ID was extracted ("✅ Application ID: ...")

## License

MIT

## Contributing

Contributions welcome! Please open an issue or pull request.

## Links

- [Repository](https://github.com/AnEntrypoint/coolify-tools)
- [Issues](https://github.com/AnEntrypoint/coolify-tools/issues)
- [NPM Package](https://www.npmjs.com/package/coolify-tools)
- [Coolify](https://coolify.io/)

## Credits

Built with Claude Code by lanmower