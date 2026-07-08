import axios from "axios";
import { API_URL, isBackendLocalhost, isElectronApp } from "../config/appConfig";

const axiosService = axios.create({
  baseURL: API_URL, // Full URL with /api/v1
});

// Request interceptor: Add Authorization header for Electron OR localhost backend
axiosService.interceptors.request.use(
  (config) => {
    // Use localStorage/Authorization header when:
    // 1. Running in Electron (Windows app uses localStorage, not cookies)
    // 2. OR backend is localhost (development)
    // For production web, use cookies as normal
    const shouldUseLocalStorage = isElectronApp() || isBackendLocalhost();
    
    if (shouldUseLocalStorage) {
      const token = localStorage.getItem('jwttoken') || localStorage.getItem('token');
      if (token) {
        // Remove "Bearer " prefix if already present
        const cleanToken = token.startsWith('Bearer ') ? token.substring(7) : token;
        
        // Set both lowercase and capitalized to ensure compatibility
        config.headers.Authorization = `Bearer ${cleanToken}`;
        config.headers.authorization = `Bearer ${cleanToken}`; // Express normalizes to lowercase
        
        // Ensure headers are properly set
        if (!config.headers) {
          config.headers = {};
        }
        config.headers.Authorization = `Bearer ${cleanToken}`;
        config.headers.authorization = `Bearer ${cleanToken}`;
        
        if (isElectronApp()) {
          console.log('🔐 [Electron] Token added to Authorization header:', {
            url: config.url,
            method: config.method,
            tokenLength: cleanToken.length,
            tokenPreview: cleanToken.substring(0, 20) + '...',
            headerSet: !!config.headers.Authorization,
            headerValue: config.headers.Authorization.substring(0, 30) + '...'
          });
        }
      } else {
        if (isElectronApp()) {
          console.warn('⚠️ [Electron] No token found in localStorage for request:', {
            url: config.url,
            method: config.method,
            localStorageKeys: Object.keys(localStorage).filter(k => k.toLowerCase().includes('token'))
          });
        }
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: Store token from login responses for Electron OR localhost backend
axiosService.interceptors.response.use(
  (response) => {
    // Store token in localStorage for Electron OR localhost backend
    // For production web, cookies handle authentication
    const shouldUseLocalStorage = isElectronApp() || isBackendLocalhost();
    
    if (shouldUseLocalStorage && response.data?.token) {
      let token = null;
      if (typeof response.data.token === 'string') {
        token = response.data.token;
      } else if (response.data.token?.token) {
        token = response.data.token.token;
      } else if (response.data.token && typeof response.data.token === 'object') {
        // Fallback: try to get token from nested object
        token = response.data.token;
      }
      if (token) {
        localStorage.setItem('jwttoken', token);
        if (isElectronApp()) {
          console.log('🔐 [Electron] Token stored in localStorage');
        }
      }
    }
    return response;
  },
  (error) => {
    // Handle 401 errors specifically for Electron
    if (error.response?.status === 401 && isElectronApp()) {
      const token = localStorage.getItem('jwttoken') || localStorage.getItem('token');
      console.error('❌ [Electron] 401 Unauthorized:', {
        url: error.config?.url,
        method: error.config?.method,
        hasToken: !!token,
        tokenPreview: token ? token.substring(0, 20) + '...' : 'none',
        errorMessage: error.response?.data?.msg || error.message
      });
      
      // Don't clear token immediately - might be a temporary issue
      // Let the router handle token clearing after confirming it's invalid
    }
    return Promise.reject(error);
  }
);


// Endpoint: It is a specific location within API that accepts data and send it back

// Helper: Get credentials setting based on environment
// For Electron OR localhost backend: Don't use credentials (we use Authorization header instead of cookies)
// For production web: Use credentials (needed for cookies)
const getCredentialsConfig = () => {
  // Electron apps use localStorage/Authorization header, not cookies
  if (isElectronApp() || isBackendLocalhost()) {
    return {
      withCredentials: false, // Electron/localhost uses Authorization header, not cookies
      credentials: "omit"
    };
  }
  return {
    withCredentials: true, // Production web needs this for cookies
    credentials: "include"
  };
};

export const getApi = async (endpoint) => {
  try {
    const credentialsConfig = getCredentialsConfig();
    const response = await axiosService.get(endpoint, {
      ...credentialsConfig,
      headers: { "Content-Type": "application/json" },
    });

    return response.data;
  } catch (error) {
    return (
      error?.response?.data || {
        success: false,
        msg: error?.message,
      }
    );
  }
};
export const getBlobApi = async (endpoint, filters = {}, accept = "text/csv") => {
  try {
    const credentialsConfig = getCredentialsConfig();
    const response = await axiosService.get(endpoint, {
      params: filters,
      responseType: "blob",
      ...credentialsConfig,
      headers: {
        Accept: accept,
      },
    });

    // Return the full response, not just response.data
    return response;
  } catch (error) {
    return (
      error?.response?.data || {
        success: false,
        msg: error?.message,
      }
    );
  }
};
export const postApi = async (endpoint, data) => {
  try {
    const credentialsConfig = getCredentialsConfig();
    const response = await axiosService.post(endpoint, data, {
      ...credentialsConfig,
      headers: { "Content-Type": "application/json" },
    });
    return response.data;
  } catch (error) {
    return (
      error?.response?.data || {
        success: false,
        msg: error?.response?.data.msg,
      }
    );
  }
};
export const postFormApi = async (endpoint, data) => {
  try {
    const credentialsConfig = getCredentialsConfig();
    const response = await axiosService.post(endpoint, data, {
      ...credentialsConfig,
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  } catch (error) {
    return (
      error?.response?.data || {
        success: false,
        msg: error?.response?.data.msg,
      }
    );
  }
};
export const patchFormApi = async (endpoint, data) => {
  try {
    const credentialsConfig = getCredentialsConfig();
    const response = await axiosService.patch(endpoint, data, {
      ...credentialsConfig,
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  } catch (error) {
    return (
      error?.response?.data || {
        success: false,
        msg: error?.response?.data.msg,
      }
    );
  }
};

export const putApi = async (endpoint, data) => {
  try {
    const credentialsConfig = getCredentialsConfig();
    const response = await axiosService.put(endpoint, data, {
      ...credentialsConfig,
      headers: { "Content-Type": "multipart/form-data" },
    });

    return response.data;
  } catch (error) {
    return (
      error?.response?.data || {
        success: false,
        msg: error?.message,
      }
    );
  }
};
export const putSimpleApi = async (endpoint, data) => {
  try {
    const credentialsConfig = getCredentialsConfig();
    const response = await axiosService.put(endpoint, data, {
      ...credentialsConfig,
      headers: { "Content-Type": "application/json" },
    });

    return response.data;
  } catch (error) {
    return (
      error?.response?.data || {
        success: false,
        msg: error?.message,
      }
    );
  }
};
export const patchApi = async (endpoint, data) => {
  try {
    const credentialsConfig = getCredentialsConfig();
    const response = await axiosService.patch(endpoint, data, {
      ...credentialsConfig,
      headers: { "Content-Type": "application/json" },
    });

    return response.data;
  } catch (error) {
    return (
      error?.response?.data || {
        success: false,
        msg: error?.message,
      }
    );
    //
  }
};

export const deleteApi = async (endpoint, options = {}) => {
  try {
    const credentialsConfig = getCredentialsConfig();
    const config = {
      ...credentialsConfig,
      headers: { "Content-Type": "application/json" },
    };
    
    // Support data in DELETE request body
    if (options.data) {
      config.data = options.data;
    }
    
    const response = await axiosService.delete(endpoint, config);

    return response.data;
  } catch (error) {
    return (
      error?.response?.data || {
        success: false,
        msg: error?.message,
      }
    );
  }
};

// SSE streaming for CSV upload with progress
export const postFormStreamApi = async (endpoint, data, onProgress) => {
  try {
    const credentialsConfig = getCredentialsConfig();
    const response = await fetch(`${API_URL}/${endpoint}`, {
      method: 'POST',
      credentials: credentialsConfig.credentials,
      body: data // FormData
    });

    // Handle HTTP errors before trying to read the stream
    if (!response.ok) {
      // Try to parse error response as JSON
      let errorMessage = 'Upload failed';
      let errorData = null;
      
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          errorData = await response.json();
          errorMessage = errorData.msg || errorData.message || errorMessage;
        } else {
          errorMessage = await response.text();
        }
      } catch (parseError) {
        // If response is not JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }

      // Handle specific status codes
      if (response.status === 413) {
        errorMessage = errorData?.msg || `File too large. Maximum file size is ${errorData?.maxSize || '50MB'}. Please split your CSV file into smaller files.`;
      }

      // Trigger error callback if provided
      if (onProgress) {
        onProgress({
          type: 'error',
          message: errorMessage,
          status: response.status,
          data: errorData
        });
      }

      return {
        success: false,
        msg: errorMessage,
        status: response.status,
        error: errorData?.error || 'UPLOAD_ERROR'
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const eventData = JSON.parse(line.substring(6));
            if (onProgress) {
              onProgress(eventData);
            }
            
            // If error event, return error
            if (eventData.type === 'error') {
              return {
                success: false,
                msg: eventData.message || 'Upload failed',
                error: eventData.error || 'UPLOAD_ERROR'
              };
            }
          } catch (parseError) {
            console.error('Error parsing SSE data:', parseError);
          }
        }
      }
    }

    return { success: true };
  } catch (error) {
    // Network errors or other exceptions
    const errorMessage = error?.message || 'Upload failed. Please check your connection and try again.';
    
    if (onProgress) {
      onProgress({
        type: 'error',
        message: errorMessage
      });
    }

    return {
      success: false,
      msg: errorMessage,
      error: 'NETWORK_ERROR'
    };
  }
};

export default axiosService