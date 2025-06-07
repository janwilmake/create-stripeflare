# Create Stripeflare

CLI to deploy a stripeflare project within a minute.

# Usage

First, ensure you have [node](https://nodejs.org/en/download) installed and [wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) authenticated to your Cloudflare account.

Then, run this and follow the instructions, which will setup the template for you, connect it with a Stripe payment link and webhook, and deploy secrets and project to your preferred domain on your cloudflare worker.

Details you need to have before running this:

- Title of the project
- Name of your worker & repo
- Domain where to deploy the worker. Can be a subdomain. Must be a valid domain you already own in your Cloudflare account.
