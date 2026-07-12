#!/usr/bin/env node

/**
 * Influnet Smoke Test Script
 * Verifies that the deployed web application is up and healthy.
 * 
 * Usage:
 *   node scripts/smoke.mjs [target-url] [--creator username] [--business username]
 * 
 * Default target-url: http://localhost:3000
 */

import { argv } from 'process';

async function runSmokeTests() {
  // Parse command line arguments
  const args = argv.slice(2);
  let targetUrl = 'http://localhost:3000';
  let creatorUsername = '';
  let businessUsername = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--creator' && args[i + 1]) {
      creatorUsername = args[i + 1];
      i++;
    } else if (args[i] === '--business' && args[i + 1]) {
      businessUsername = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--')) {
      targetUrl = args[i];
    }
  }

  // Remove trailing slash if present
  targetUrl = targetUrl.replace(/\/$/, '');

  console.log(`🚀 Starting smoke tests against: ${targetUrl}`);
  let failures = 0;

  // Helper assertion function
  async function assertRoute(path, options, validateFn) {
    const url = `${targetUrl}${path}`;
    try {
      const response = await fetch(url, options);
      console.log(`Checking ${path}...`);
      await validateFn(response);
      console.log(`✅ ${path} PASSED`);
    } catch (error) {
      console.error(`❌ ${path} FAILED:`, error.message);
      failures++;
    }
  }

  // Test 1: Health endpoint
  await assertRoute('/api/health', {}, async (res) => {
    if (res.status !== 200) {
      throw new Error(`Expected status 200, got ${res.status}`);
    }
    const data = await res.json();
    if (data.status !== 'healthy' || data.database !== 'connected') {
      throw new Error(`Unhealthy status: ${JSON.stringify(data)}`);
    }
  });

  // Test 2: Landing page
  await assertRoute('/', {}, async (res) => {
    if (res.status !== 200) {
      throw new Error(`Expected status 200, got ${res.status}`);
    }
  });

  // Test 3: Login page
  await assertRoute('/login', {}, async (res) => {
    if (res.status !== 200) {
      throw new Error(`Expected status 200, got ${res.status}`);
    }
  });

  // Test 4: Dashboard unauthorized redirect
  await assertRoute('/dashboard', { redirect: 'manual' }, async (res) => {
    // A redirect status of 307 or 302 is expected
    if (res.status !== 307 && res.status !== 302) {
      throw new Error(`Expected redirect status 307 or 302, got ${res.status}`);
    }
    const location = res.headers.get('location');
    if (!location || !location.includes('/login')) {
      throw new Error(`Expected redirect location to contain '/login', got: ${location}`);
    }
  });

  // Test 5: Known creator profile (if provided)
  if (creatorUsername) {
    await assertRoute(`/c/${creatorUsername}`, {}, async (res) => {
      if (res.status !== 200) {
        throw new Error(`Expected status 200, got ${res.status}`);
      }
    });
  } else {
    console.log('ℹ️ Skipped creator profile check (no --creator username provided)');
  }

  // Test 6: Known business profile (if provided)
  if (businessUsername) {
    await assertRoute(`/b/${businessUsername}`, {}, async (res) => {
      if (res.status !== 200) {
        throw new Error(`Expected status 200, got ${res.status}`);
      }
    });
  } else {
    console.log('ℹ️ Skipped business profile check (no --business username provided)');
  }

  console.log('\n--- Smoke Test Summary ---');
  if (failures > 0) {
    console.error(`💥 Smoke test failed with ${failures} error(s).`);
    process.exit(1);
  } else {
    console.log('🎉 All smoke tests passed successfully!');
    process.exit(0);
  }
}

runSmokeTests().catch((err) => {
  console.error('Fatal smoke test run error:', err);
  process.exit(1);
});
