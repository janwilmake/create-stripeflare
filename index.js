#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createInterface } from 'readline';
import { homedir } from 'os';
import { randomBytes } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Main CLI function
 */
async function main() {
  try {
    const args = process.argv.slice(2);
    let [name, domain] = args;

    // Load environment variables from ~/.stripeflare.dev.vars
    const envVars = loadEnvVars();
    
    // Prompt for missing arguments
    if (!name) {
      name = await prompt('Project name: ');
    }
    if (!domain) {
      domain = await prompt('Domain: ');
    }

    console.log(`Creating Stripeflare project: ${name}`);
    console.log(`Domain: ${domain}`);

    // Create project directory
    if (existsSync(name)) {
      throw new Error(`Directory ${name} already exists`);
    }
    mkdirSync(name, { recursive: true });

    // Copy template files
    const templateDir = join(__dirname, 'template');
    copyDirectory(templateDir, name);

    // Replace placeholders in all files
    replacePlaceholders(name, { name, domain });

    // Initialize git
    execSync('git init', { cwd: name, stdio: 'inherit' });
    
    if (envVars.GITHUB_OWNER) {
      const remoteUrl = `https://github.com/${envVars.GITHUB_OWNER}/${name}`;
      execSync(`git remote add origin ${remoteUrl}`, { cwd: name, stdio: 'inherit' });
      console.log(`Git remote set to: ${remoteUrl}`);
    }

    // Create Stripe payment link
    const paymentLink = await createStripePaymentLink(name, envVars.STRIPE_SECRET);
    
    // Create Stripe webhook
    const webhookSecret = await createStripeWebhook(domain, envVars.STRIPE_SECRET);

    // Generate DB secret
    const dbSecret = randomBytes(16).toString('hex');

    // Create .dev.vars file
    const devVars = {
      STRIPE_SECRET: envVars.STRIPE_SECRET || '',
      STRIPE_PUBLISHABLE_KEY: envVars.STRIPE_PUBLISHABLE_KEY || '',
      STRIPE_PAYMENT_LINK: paymentLink,
      STRIPE_WEBHOOK_SIGNING_SECRET: webhookSecret,
      DB_SECRET: dbSecret
    };

    writeDevVars(name, devVars);

    // Run npm install
    console.log('Installing dependencies...');
    execSync('npm install', { cwd: name, stdio: 'inherit' });

    // Upload secrets to Cloudflare Workers
    console.log('Uploading secrets to Cloudflare Workers...');
    execSync('wrangler secret bulk .dev.vars', { cwd: name, stdio: 'inherit' });

    // Deploy to Cloudflare Workers
    console.log('Deploying to Cloudflare Workers...');
    execSync('wrangler deploy', { cwd: name, stdio: 'inherit' });

    console.log(`\n✅ Successfully created ${name}!`);
    console.log(`📁 cd ${name}`);
    console.log(`🚀 Project deployed and ready to go!`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

/**
 * Load environment variables from ~/.stripeflare.dev.vars
 * @returns {Object} Environment variables object
 */
function loadEnvVars() {
  const envPath = join(homedir(), '.stripeflare.dev.vars');
  const envVars = {};
  
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        envVars[key.trim()] = value.trim();
      }
    });
  }
  
  return envVars;
}

/**
 * Prompt user for input
 * @param {string} question - Question to ask
 * @returns {Promise<string>} User input
 */
function prompt(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Recursively copy directory contents
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 */
function copyDirectory(src, dest) {
  if (!existsSync(src)) {
    throw new Error(`Template directory not found: ${src}`);
  }

  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src);

  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);

    if (statSync(srcPath).isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Replace placeholders in all files
 * @param {string} projectDir - Project directory
 * @param {Object} replacements - Object with replacement values
 */
function replacePlaceholders(projectDir, replacements) {
  const processFile = (filePath) => {
    const stat = statSync(filePath);
    
    if (stat.isDirectory()) {
      const entries = readdirSync(filePath);
      entries.forEach(entry => {
        processFile(join(filePath, entry));
      });
    } else {
      try {
        let content = readFileSync(filePath, 'utf8');
        
        Object.entries(replacements).forEach(([key, value]) => {
          const placeholder = `{{${key}}}`;
          content = content.replaceAll(placeholder, value);
        });
        
        writeFileSync(filePath, content, 'utf8');
      } catch (error) {
        // Skip binary files
        if (error.code !== 'EISDIR') {
          console.warn(`Warning: Could not process file ${filePath}`);
        }
      }
    }
  };

  processFile(projectDir);
}

/**
 * Create Stripe payment link
 * @param {string} name - Project name
 * @param {string} stripeSecret - Stripe secret key
 * @returns {Promise<string>} Payment link ID
 */
async function createStripePaymentLink(name, stripeSecret) {
  if (!stripeSecret) {
    console.warn('Warning: STRIPE_SECRET not found, skipping payment link creation');
    return '';
  }

  try {
    console.log('Creating Stripe payment link...');
    
    // Create a product first
    const productResponse = await fetch('https://api.stripe.com/v1/products', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        name: name,
        type: 'service'
      })
    });

    if (!productResponse.ok) {
      throw new Error(`Failed to create product: ${productResponse.statusText}`);
    }

    const product = await productResponse.json();

    // Create a price (no amount, customer enters amount)
    const priceResponse = await fetch('https://api.stripe.com/v1/prices', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        product: product.id,
        currency: 'usd',
        'custom_unit_amount[enabled]': 'true',
        'custom_unit_amount[minimum]': '100' // $1.00 minimum
      })
    });

    if (!priceResponse.ok) {
      throw new Error(`Failed to create price: ${priceResponse.statusText}`);
    }

    const price = await priceResponse.json();

    // Create payment link
    const linkResponse = await fetch('https://api.stripe.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'line_items[0][price]': price.id,
        'line_items[0][quantity]': '1'
      })
    });

    if (!linkResponse.ok) {
      throw new Error(`Failed to create payment link: ${linkResponse.statusText}`);
    }

    const link = await linkResponse.json();
    console.log(`✅ Created payment link: ${link.url}`);
    
    return link.id;
  } catch (error) {
    console.warn(`Warning: Failed to create payment link: ${error.message}`);
    return '';
  }
}

/**
 * Create Stripe webhook
 * @param {string} domain - Domain for webhook URL
 * @param {string} stripeSecret - Stripe secret key
 * @returns {Promise<string>} Webhook signing secret
 */
async function createStripeWebhook(domain, stripeSecret) {
  if (!stripeSecret) {
    console.warn('Warning: STRIPE_SECRET not found, skipping webhook creation');
    return '';
  }

  try {
    console.log('Creating Stripe webhook...');
    
    const webhookResponse = await fetch('https://api.stripe.com/v1/webhook_endpoints', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        url: `https://${domain}/stripe-webhook`,
        'enabled_events[]': 'checkout.session.completed'
      })
    });

    if (!webhookResponse.ok) {
      throw new Error(`Failed to create webhook: ${webhookResponse.statusText}`);
    }

    const webhook = await webhookResponse.json();
    console.log(`✅ Created webhook: ${webhook.url}`);
    
    return webhook.secret;
  } catch (error) {
    console.warn(`Warning: Failed to create webhook: ${error.message}`);
    return '';
  }
}

/**
 * Write .dev.vars file
 * @param {string} projectDir - Project directory
 * @param {Object} vars - Environment variables
 */
function writeDevVars(projectDir, vars) {
  const content = Object.entries(vars)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  writeFileSync(join(projectDir, '.dev.vars'), content);
  console.log('✅ Created .dev.vars file');
}

// Run the CLI
main().catch(console.error);