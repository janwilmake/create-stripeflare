# {{name}}

A Stripe + Cloudflare Workers project.

## Setup

1. Install dependencies: `npm install`
2. Configure your environment variables in `.dev.vars`
3. Deploy: `npm run deploy`

## Development

- `npm run dev` - Start local development server
- `npm run deploy` - Deploy to Cloudflare Workers

## Environment Variables

- `STRIPE_SECRET` - Your Stripe secret key
- `STRIPE_PUBLISHABLE_KEY` - Your Stripe publishable key
- `STRIPE_PAYMENT_LINK` - Stripe payment link ID
- `STRIPE_WEBHOOK_SIGNING_SECRET` - Stripe webhook signing secret
- `DB_SECRET` - Database encryption secret

## Domain

This project is configured for: {{domain}}