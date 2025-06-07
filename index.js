#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import crypto from "crypto";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main entry point for the create-stripeflare CLI
 */
async function main() {
  try {
    console.log("🚀 Creating Stripeflare project...\n");

    // Load environment variables
    const envVars = loadEnvVars();

    // Prompt for project details
    const projectConfig = await promptForProjectDetails();

    // Create project directory and copy template
    createProject(projectConfig);

    // Replace template variables
    replaceTemplateVariables(projectConfig);

    // Install dependencies
    installDependencies(projectConfig.name);

    // Create Stripe price and payment link
    const paymentLink = await createStripePaymentLink(envVars, projectConfig);

    // Create Stripe webhook
    const webhookSecret = await createStripeWebhook(envVars, projectConfig);

    // Generate secrets and create .dev.vars
    createDevVars(projectConfig, envVars, paymentLink, webhookSecret);

    // Deploy and upload secrets
    await deployProject(projectConfig.name);

    console.log("\n✅ StripeFlare project created successfully!");
    console.log(`📁 Project location: ./${projectConfig.name}`);
    console.log(`🌐 Domain: ${projectConfig.domain}`);
    console.log(`💳 Payment link: ${paymentLink}`);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

/**
 * Load environment variables from ~/.stripeflare.dev.vars
 * @returns {Object} Environment variables object
 */
function loadEnvVars() {
  const envPath = path.join(os.homedir(), ".stripeflare.dev.vars");

  if (!fs.existsSync(envPath)) {
    throw new Error(
      "~/.stripeflare.dev.vars file not found. Please create it with STRIPE_SECRET, STRIPE_PUBLISHABLE_KEY, and GITHUB_OWNER.",
    );
  }

  const envContent = fs.readFileSync(envPath, "utf8");
  const envVars = {};

  envContent.split("\n").forEach((line) => {
    const [key, value] = line.split("=");
    if (key && value) {
      envVars[key.trim()] = value.trim();
    }
  });

  const required = ["STRIPE_SECRET", "STRIPE_PUBLISHABLE_KEY", "GITHUB_OWNER"];
  for (const key of required) {
    if (!envVars[key]) {
      throw new Error(`Missing ${key} in ~/.stripeflare.dev.vars`);
    }
  }

  return envVars;
}

/**
 * Prompt user for project configuration
 * @returns {Promise<Object>} Project configuration object
 */
async function promptForProjectDetails() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt) =>
    new Promise((resolve) => rl.question(prompt, resolve));

  try {
    const name = await question("Worker/repo name: ");
    const domain = await question("Domain: ");
    const title = await question("Title: ");
    const price = await question("Price (in USD, e.g., 19.99): ");

    if (!name || !domain || !title || !price) {
      throw new Error("All fields are required");
    }

    // Validate price
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      throw new Error("Price must be a valid positive number");
    }

    return {
      name: name.trim(),
      domain: domain.trim(),
      title: title.trim(),
      price: priceNum,
    };
  } finally {
    rl.close();
  }
}

/**
 * Create project directory and copy template files
 * @param {Object} config - Project configuration
 */
function createProject(config) {
  const templatePath = path.join(__dirname, "template");
  const projectPath = path.resolve(config.name);

  if (!fs.existsSync(templatePath)) {
    throw new Error("Template folder not found");
  }

  if (fs.existsSync(projectPath)) {
    throw new Error(`Directory ${config.name} already exists`);
  }

  // Copy template recursively
  copyRecursive(templatePath, projectPath);

  // Initialize git
  process.chdir(projectPath);
  execSync("git init", { stdio: "inherit" });
  execSync(
    `git remote add origin https://github.com/${
      process.env.GITHUB_OWNER || "user"
    }/${config.name}`,
    { stdio: "inherit" },
  );

  console.log(`✅ Created project directory: ${config.name}`);
}

/**
 * Recursively copy directory
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 */
function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Replace template variables in all files
 * @param {Object} config - Project configuration
 */
function replaceTemplateVariables(config) {
  const replacements = {
    "{{name}}": config.name,
    "{{domain}}": config.domain,
    "{{title}}": config.title,
  };

  replaceInDirectory(".", replacements);
  console.log("✅ Replaced template variables");
}

/**
 * Recursively replace variables in directory
 * @param {string} dir - Directory path
 * @param {Object} replacements - Replacement mappings
 */
function replaceInDirectory(dir, replacements) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (
      entry.isDirectory() &&
      entry.name !== ".git" &&
      entry.name !== "node_modules"
    ) {
      replaceInDirectory(fullPath, replacements);
    } else if (entry.isFile()) {
      replaceInFile(fullPath, replacements);
    }
  }
}

/**
 * Replace variables in a single file
 * @param {string} filePath - File path
 * @param {Object} replacements - Replacement mappings
 */
function replaceInFile(filePath, replacements) {
  try {
    let content = fs.readFileSync(filePath, "utf8");

    for (const [search, replace] of Object.entries(replacements)) {
      content = content.replaceAll(search, replace);
    }

    fs.writeFileSync(filePath, content);
  } catch (error) {
    // Skip binary files or files that can't be read as text
    if (error.code !== "EISDIR") {
      console.warn(`Warning: Could not process file ${filePath}`);
    }
  }
}

/**
 * Install npm dependencies
 * @param {string} projectName - Project name for context
 */
function installDependencies(projectName) {
  console.log("📦 Installing dependencies...");
  execSync("npm install", { stdio: "inherit" });
  console.log("✅ Dependencies installed");
}

/**
 * Create Stripe product, price, and payment link
 * @param {Object} envVars - Environment variables
 * @param {Object} config - Project configuration
 * @returns {Promise<string>} Payment link URL
 */
async function createStripePaymentLink(envVars, config) {
  console.log("💳 Creating Stripe product and price...");

  // First, create a product
  const productResponse = await fetch("https://api.stripe.com/v1/products", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${envVars.STRIPE_SECRET}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      name: config.title,
      type: "service", // or "good" if it's a physical product
    }),
  });

  if (!productResponse.ok) {
    const error = await productResponse.text();
    throw new Error(`Failed to create product: ${error}`);
  }

  const product = await productResponse.json();
  console.log("✅ Created Stripe product");

  // Create a price for the product
  const priceResponse = await fetch("https://api.stripe.com/v1/prices", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${envVars.STRIPE_SECRET}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      currency: "usd",
      product: product.id,
      unit_amount: Math.round(config.price * 100), // Convert to cents
    }),
  });

  if (!priceResponse.ok) {
    const error = await priceResponse.text();
    throw new Error(`Failed to create price: ${error}`);
  }

  const price = await priceResponse.json();
  console.log("✅ Created Stripe price");

  // Now create the payment link using the price ID
  const paymentLinkResponse = await fetch(
    "https://api.stripe.com/v1/payment_links",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${envVars.STRIPE_SECRET}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "line_items[0][price]": price.id,
        "line_items[0][quantity]": "1",
      }),
    },
  );

  if (!paymentLinkResponse.ok) {
    const error = await paymentLinkResponse.text();
    throw new Error(`Failed to create payment link: ${error}`);
  }

  const paymentLink = await paymentLinkResponse.json();
  console.log("✅ Created Stripe payment link");

  return paymentLink.url;
}

/**
 * Create Stripe webhook
 * @param {Object} envVars - Environment variables
 * @param {Object} config - Project configuration
 * @returns {Promise<string>} Webhook signing secret
 */
async function createStripeWebhook(envVars, config) {
  console.log("🔗 Creating Stripe webhook...");

  const response = await fetch("https://api.stripe.com/v1/webhook_endpoints", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${envVars.STRIPE_SECRET}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      url: `https://${config.domain}/stripe-webhook`,
      "enabled_events[]": "checkout.session.completed",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create webhook: ${error}`);
  }

  const webhook = await response.json();
  console.log("✅ Created Stripe webhook");

  return webhook.secret;
}

/**
 * Create .dev.vars file with all secrets
 * @param {Object} config - Project configuration
 * @param {Object} envVars - Environment variables
 * @param {string} paymentLink - Stripe payment link URL
 * @param {string} webhookSecret - Webhook signing secret
 */
function createDevVars(config, envVars, paymentLink, webhookSecret) {
  const dbSecret = crypto.randomBytes(16).toString("hex");

  const devVarsContent = [
    `STRIPE_SECRET=${envVars.STRIPE_SECRET}`,
    `STRIPE_PUBLISHABLE_KEY=${envVars.STRIPE_PUBLISHABLE_KEY}`,
    `STRIPE_PAYMENT_LINK=${paymentLink}`,
    `STRIPE_WEBHOOK_SIGNING_SECRET=${webhookSecret}`,
    `DB_SECRET=${dbSecret}`,
  ].join("\n");

  fs.writeFileSync(".dev.vars", devVarsContent);
  console.log("✅ Created .dev.vars file");
}

/**
 * Deploy project and upload secrets
 * @param {string} projectName - Project name for context
 */
async function deployProject(projectName) {
  console.log("🚀 Deploying to Cloudflare...");

  try {
    console.log("🔐 Uploading secrets...");
    execSync("wrangler secret bulk .dev.vars", { stdio: "inherit" });
    console.log("✅ Secrets uploaded");

    execSync("wrangler deploy", { stdio: "inherit" });
    console.log("✅ Deployed to Cloudflare");
  } catch (error) {
    console.warn(
      "⚠️  Warning: Deployment or secret upload failed. You may need to run these commands manually:",
    );
    console.warn("   wrangler secret bulk .dev.vars");
    console.warn("   wrangler deploy");
  }
}

// Run the CLI
main();
