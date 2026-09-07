import { createRequire } from 'node:module';

// Optional local runtime override; a normal clean checkout uses npm ci.
const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
export const browserName = process.env.PLAYWRIGHT_BROWSER || 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(browserName)) {
  throw new Error(`Unsupported PLAYWRIGHT_BROWSER: ${browserName}. Choose chromium, firefox or webkit.`);
}

export function launchBrowser() {
  if (process.env.PLAYWRIGHT_CHANNEL && browserName !== 'chromium') {
    throw new Error('PLAYWRIGHT_CHANNEL is supported only for Chromium. Unset it when selecting Firefox or WebKit.');
  }
  const executablePath = process.env[`PLAYWRIGHT_${browserName.toUpperCase()}_EXECUTABLE_PATH`];
  return playwright[browserName].launch({ headless: true, timeout: 30000,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    ...(executablePath ? { executablePath } : {})
  });
}
