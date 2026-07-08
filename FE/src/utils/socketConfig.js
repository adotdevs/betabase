/**
 * Get the backend URL for Socket.io connections
 * Uses domain-matched API URLs to avoid third-party cookie issues
 * 
 * @returns {string} Backend URL for Socket.io
 */
import { getBackendUrl } from "../config/appConfig";

export const getSocketBackendUrl = () => {
  return getBackendUrl();
};

/**
 * Default Socket.io connection options
 */
export const socketOptions = {
  withCredentials: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
};

