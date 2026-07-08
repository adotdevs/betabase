// src/config.js
// Legacy file - now uses centralized config
// @deprecated Use appConfig.js instead

import { getApiUrl } from "../config/appConfig";

const baseUrl = getApiUrl();

// ES6 export only (removed CommonJS for ES module compatibility)
export { baseUrl };
