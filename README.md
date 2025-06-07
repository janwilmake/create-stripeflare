# Create Stripeflare

CLI to deploy a stripeflare project within a minute.

# Usage

First, ensure you have [node](https://nodejs.org/en/download) installed and [wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) authenticated to your Cloudflare account.

Also, create a config file at `~/.stripeflare.dev.vars` with the following information filled in:

```
STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET=
GITHUB_OWNER=
```

Then, run this and follow the instructions, which will setup the template for you, connect it with a Stripe payment link and webhook, and deploy secrets and project to your preferred domain on your cloudflare worker.

```
npx create-stripeflare
```

Details you need to have before running this:

- Title of the project
- Name of your worker & repo
- Domain where to deploy the worker. Can be a subdomain. Must be a valid domain you already own in your Cloudflare account.

Please note this will not create a repo in your GitHub but it WILL set
