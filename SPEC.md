Let's make a new cli with node that can be ran using `npx create-stripeflare`

it should:

- gets STRIPE_SECRET, STRIPE_PUBLISHABLE_KEY, and GITHUB_OWNER if available at ~/.stripeflare.dev.vars. if not present, exit.
- prompt for name, domain, and title
- copy files from template folder into that folder and use git init and set remote to https://github.com/{{GITHUBOWNER}}/{{name}}
- runs a replace on all files in there replacing {{name}}, {{domain}} and {{title}}
- npm install
- creates a payment link using the stripe API with the same title and puts that in .dev.vars STRIPE_PAYMENT_LINK. use sensible default (no price, USD)
- creates a webhook to https://{domain}/stripe-webhook and gets the STRIPE_WEBHOOK_SIGNING_SECRET and inserts that to .dev.vars. The only event in the webhook should be `checkout.session.completed`
- generate a 32 character random string and set that to DB_SECRET in .dev.vars
- run 'wrangler secret bulk .dev.vars' to upload all secrets to the worker
- wrangler deploy

The bin of the package is 'create-stripeflare' so it can be ran using npx create-stripeflare

No dependencies and keep it super minimal. use `fetch` (not node-fetch) for making http requests

Let's create this as node cli using .js and proper Doc comments. I already have the template folder with my template.
