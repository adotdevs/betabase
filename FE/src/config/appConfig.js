/**
 * Centralized Application Configuration
 * 
 * All domain and API URLs are defined here.
 * Change values in one place to update across the entire application.
 * 
 * Priority order:
 * 1. Environment variables (REACT_APP_*)
 * 2. Domain-based detection (production)
 * 3. Default fallback values
 */

// ============================================
// DOMAIN CONFIGURATION
// ============================================

/**
 * Detect if running in Electron
 * Electron apps use file:// protocol and should always use production API
 */
export const isElectronApp = () => {
  return (
    typeof window !== 'undefined' &&
    (window.electron?.isElectron === true || 
     window.navigator?.userAgent?.includes('Electron') ||
     (window.process && window.process.type === 'renderer') ||
     window.location.protocol === 'file:')
  );
};

/**
 * Get the frontend domain (without protocol)
 * Used for cookie domain and domain matching
 */
export const getFrontendDomain = () => {
  // Environment variable override
  if (process.env.REACT_APP_FRONTEND_DOMAIN) {
    return process.env.REACT_APP_FRONTEND_DOMAIN;
  }

  // Electron app: Use production domain
  if (isElectronApp()) {
    return 'betabase.pro';
  }

  // Auto-detect from current hostname
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  
  // Production domain
  if (hostname.includes('betabase.pro')) {
    return 'betabase.pro';
  }

  // Development fallback
  return hostname || 'localhost';
};

/**
 * Get the API base URL (without /api/v1)
 * Returns just the protocol + hostname
 */
export const getApiBaseUrl = () => {
  // Check if we're in production (not localhost)
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';
  const isProduction = protocol === 'https:' && !hostname.includes('localhost') && hostname !== '127.0.0.1';
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';

  // Electron app: Always use production API (app is distributed, server is on VPS)
  if (isElectronApp()) {
    return 'https://api.betabase.pro';
  }

  // Production environment: NEVER use localhost, always use production API
  if (isProduction || (!isLocalhost && hostname.includes('betabase.pro'))) {
    return 'https://api.betabase.pro';
  }

  // Environment variable override (only for development/localhost)
  if (process.env.REACT_APP_API_BASE_URL && isLocalhost) {
    // Only allow localhost in development
    const envUrl = process.env.REACT_APP_API_BASE_URL;
    if (envUrl.includes('localhost') || envUrl.includes('127.0.0.1')) {
      return envUrl;
    }
    // If env var is set but not localhost, warn and use production
    console.warn('REACT_APP_API_BASE_URL is set to non-localhost in production, using production API instead');
  }

  // Parse from REACT_APP_API_URL if available (only for development)
  if (process.env.REACT_APP_API_URL && isLocalhost) {
    try {
      const url = new URL(process.env.REACT_APP_API_URL);
      // Only allow localhost in development
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return `${url.protocol}//${url.host}`;
      }
      // If env var is set but not localhost, warn and use production
      console.warn('REACT_APP_API_URL is set to non-localhost in production, using production API instead');
    } catch (e) {
      console.warn('Invalid REACT_APP_API_URL:', process.env.REACT_APP_API_URL);
    }
  }

  // Development fallback (only for localhost)
  if (isLocalhost) {
    return 'http://localhost:4000'; // Default dev backend port
  }

  // Production fallback (should never reach here, but safety net)
  return 'https://api.betabase.pro';
};

/**
 * Check if backend is localhost (for development)
 * Returns true ONLY if:
 * 1. Backend API is on localhost/127.0.0.1
 * 2. Frontend is also on localhost (double security check)
 * 
 * SECURITY: This function is critical - it determines if we use localStorage (dev) or cookies (production)
 * NEVER returns true for production URLs (https://api.betabase.pro)
 * NEVER returns true if frontend is on production domain (betabase.pro)
 */
export const isBackendLocalhost = () => {
  try {
    // SECURITY CHECK 1: Verify frontend is also localhost
    // If frontend is on production domain, NEVER use localStorage (even if backend URL is somehow localhost)
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const protocol = window.location.protocol;
      
      // If frontend is on production domain, always return false (use cookies)
      if (hostname.includes('betabase.pro') && protocol === 'https:') {
        return false; // Production frontend - always use cookies, NEVER localStorage
      }
      
      // If frontend is not localhost, don't use localStorage
      if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '') {
        return false; // Not localhost frontend - use cookies
      }
    }
    
    // SECURITY CHECK 2: Verify backend URL is localhost
    const apiBaseUrl = getApiBaseUrl();
    
    // Explicitly check for localhost/127.0.0.1 only
    const isLocalhostBackend = apiBaseUrl.includes('localhost') || apiBaseUrl.includes('127.0.0.1');
    
    // SECURITY CHECK 3: Double-check - if it contains production domain, it's NOT localhost
    if (apiBaseUrl.includes('betabase.pro') || apiBaseUrl.includes('api.betabase.pro')) {
      return false; // Production backend - use cookies, NOT localStorage
    }
    
    // SECURITY: Only return true if BOTH frontend AND backend are localhost
    return isLocalhostBackend;
  } catch (e) {
    // On error, default to false (use cookies/production behavior)
    // This is the safest default - never use localStorage on error
    console.warn('Error checking if backend is localhost, defaulting to production behavior (cookies):', e);
    return false;
  }
};

/**
 * Get the full API URL with /api/v1 path
 */
export const getApiUrl = () => {
  // PRIORITY 1: Electron app ALWAYS uses production API (ignore all env vars)
  if (isElectronApp()) {
    return 'https://api.betabase.pro/api/v1';
  }

  // Check if we're in production (not localhost)
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';

  // PRIORITY 2: Check environment variables (only for web, not Electron)
  if (process.env.REACT_APP_API_URL) {
    const envUrl = process.env.REACT_APP_API_URL.trim();
    
    // Only allow localhost URLs in development
    if (isLocalhost) {
      try {
        const url = new URL(envUrl);
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
          // If it already includes /api/v1, return as is
          if (envUrl.includes('/api/v1')) {
            return envUrl;
          }
          // If it includes /api but not /v1, add /v1
          if (envUrl.includes('/api') && !envUrl.includes('/api/v1')) {
            return envUrl.endsWith('/api') ? `${envUrl}/v1` : `${envUrl}/v1`;
          }
          // Otherwise add /api/v1
          const cleanUrl = envUrl.replace(/\/$/, '');
          return `${cleanUrl}/api/v1`;
        }
      } catch (e) {
        // Invalid URL, fall through to baseUrl logic
      }
    }
    // If env var is set but not localhost in production, ignore it and use production
    if (!isLocalhost) {
      console.warn('REACT_APP_API_URL is set to non-localhost in production, ignoring and using production API');
    }
  }
  
  // PRIORITY 3: Get base URL and ensure /api/v1 is added
  const baseUrl = getApiBaseUrl();
  
  // Remove trailing slash if present
  let cleanBaseUrl = baseUrl.replace(/\/$/, '');
  
  // Check if /api/v1 is already present
  if (cleanBaseUrl.endsWith('/api/v1')) {
    return cleanBaseUrl;
  }
  
  // Check if /api is present but not /v1
  if (cleanBaseUrl.endsWith('/api')) {
    return `${cleanBaseUrl}/v1`;
  }
  
  // Check if /api/ is in the middle (shouldn't happen, but handle it)
  if (cleanBaseUrl.includes('/api/')) {
    // Already has /api/ somewhere, return as is (might be malformed)
    return cleanBaseUrl;
  }
  
  // Add /api/v1 if not present
  return `${cleanBaseUrl}/api/v1`;
};

/**
 * Get cookie domain for authentication
 * Returns domain with leading dot for subdomain support (e.g., ".betabase.pro")
 */
export const getCookieDomain = () => {
  const domain = getFrontendDomain();
  
  // Don't set cookie domain for localhost
  if (domain === 'localhost' || domain.includes('localhost')) {
    return '';
  }

  // Return with leading dot for subdomain support
  return `.${domain}`;
};

/**
 * Get support email address
 */
export const getSupportEmail = () => {
  if (process.env.REACT_APP_SUPPORT_EMAIL) {
    return process.env.REACT_APP_SUPPORT_EMAIL;
  }
  
  // Electron app: Always use production support email
  if (isElectronApp()) {
    return 'admin@betabase.pro';
  }
  
  const domain = getFrontendDomain();
  if (domain.includes('betabase.pro')) {
    return 'admin@betabase.pro';
  }
  
  return 'support@localhost';
};

// ============================================
// EXPORTED CONFIGURATION VALUES
// ============================================

export const APP_CONFIG = {
  // Frontend domain
  FRONTEND_DOMAIN: getFrontendDomain(),
  
  // API URLs
  API_BASE_URL: getApiBaseUrl(),
  API_URL: getApiUrl(),
  
  // Cookie configuration
  COOKIE_DOMAIN: getCookieDomain(),
  
  // Support
  SUPPORT_EMAIL: getSupportEmail(),
  
  // Environment
  IS_PRODUCTION: typeof window !== 'undefined' 
    ? window.location.protocol === 'https:' && !window.location.hostname.includes('localhost')
    : false,
};

// Export API_URL directly for convenience
export const API_URL = APP_CONFIG.API_URL;
export const API_BASE_URL = APP_CONFIG.API_BASE_URL;

// Debug logging (only in development or if explicitly enabled)
if (typeof window !== 'undefined' && (process.env.NODE_ENV === 'development' || localStorage.getItem('debug_api_config') === 'true')) {
  console.log('🔧 API Configuration:', {
    API_URL: API_URL,
    API_BASE_URL: API_BASE_URL,
    hostname: window.location.hostname,
    protocol: window.location.protocol,
    isElectron: isElectronApp(),
    REACT_APP_API_URL: process.env.REACT_APP_API_URL,
    REACT_APP_API_BASE_URL: process.env.REACT_APP_API_BASE_URL,
  });
}

// ============================================
// HELPER FUNCTIONS FOR BACKWARD COMPATIBILITY
// ============================================

/**
 * Get backend URL for Socket.io/SSE connections
 * Returns just protocol + hostname (no /api path)
 */
export const getBackendUrl = () => {
  return getApiBaseUrl();
};

/**
 * Legacy function for baseUrl (with /api/v1)
 * @deprecated Use getApiUrl() instead
 */
export const getBaseUrl = () => {
  return getApiUrl();
};

// Default export for easy importing
export default APP_CONFIG;
