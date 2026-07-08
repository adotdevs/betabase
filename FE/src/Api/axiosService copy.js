import axios from "axios";
import { baseUrl } from "../utils/Constant";

const axiosService = axios.create({
  baseURL: "https://api.vocaledge.io/api/v1",
  // baseURL: baseUrl, 
});

// Endpoint: It is a specific location within API that accepts data and send it back

export const getApi = async (endpoint) => {
  try {
    const response = await axiosService.get(endpoint, {
      withCredentials: true,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
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
export const getBlobApi = async (endpoint, filters = {}) => {
  try {
    const response = await axiosService.get(endpoint, {
      params: filters,
      responseType: 'blob',
      withCredentials: true,
      headers: {
        'Accept': 'text/csv'
      },
      credentials: "include",
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
    const response = await axiosService.post(endpoint, data, {
      withCredentials: true,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
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
    const response = await axiosService.post(endpoint, data, {
      withCredentials: true,
      headers: { "Content-Type": "multipart/form-data" },

      credentials: "include",
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
    const response = await axiosService.patch(endpoint, data, {
      withCredentials: true,
      headers: { "Content-Type": "multipart/form-data" },

      credentials: "include",
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
    const response = await axiosService.put(endpoint, data, {
      withCredentials: true,
      headers: { "Content-Type": "multipart/form-data" },
      credentials: "include",
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
    const response = await axiosService.put(endpoint, data, {
      withCredentials: true,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
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
    const response = await axiosService.patch(endpoint, data, {
      withCredentials: true,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
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
    const config = {
      withCredentials: true,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
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
    const response = await fetch(`${baseUrl}/${endpoint}`, {
      method: 'POST',
      credentials: 'include',
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