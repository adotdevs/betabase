/**
 * Electron production build — tuned for low-RAM Linux VPS.
 * Sets env vars before invoking react-scripts build (no cross-env needed).
 */
process.env.PUBLIC_URL = './';
process.env.GENERATE_SOURCEMAP = 'false';
process.env.DISABLE_ESLINT_PLUGIN = 'true';
process.env.CI = 'true';

if (!process.env.NODE_OPTIONS) {
  process.env.NODE_OPTIONS = '--max-old-space-size=2048';
}

require('react-scripts/scripts/build');
