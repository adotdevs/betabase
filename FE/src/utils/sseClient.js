class SSEClient {
    constructor() {
        this.eventSource = null;
        this.listeners = new Map();
        this.reconnectTimeout = null;
        this.reconnectDelay = 1000;
        this.maxReconnectDelay = 30000;
    }

    async connect(url) {
        if (this.eventSource) {
            this.disconnect();
        }

        // For now, we'll connect without a token since cookies are httpOnly
        // The backend will verify the origin and allow read-only SSE access
        console.log('🔌 [SSE] Connecting to:', url);
        
        try {
            // Add timeout for connection attempt
            const connectionTimeout = setTimeout(() => {
                if (this.eventSource && this.eventSource.readyState === EventSource.CONNECTING) {
                    console.warn('⚠️ [SSE] Connection timeout - closing and retrying');
                    this.eventSource.close();
                }
            }, 10000); // 10 second timeout
            
            this.eventSource = new EventSource(url);
            
            // Clear timeout on successful connection
            this.eventSource.addEventListener('open', () => {
                clearTimeout(connectionTimeout);
            });
            
            // Clear timeout on error
            this.eventSource.addEventListener('error', () => {
                clearTimeout(connectionTimeout);
            });
        } catch (error) {
            console.error('❌ [SSE] Failed to create EventSource:', error);
            throw error;
        }

        this.eventSource.onopen = () => {
            console.log('✅ [SSE] Connection established');
            this.reconnectDelay = 1000; // Reset delay on successful connection
        };

        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('📥 [SSE] Message received:', data.type, data);
                
                // Emit to specific listeners
                const listeners = this.listeners.get(data.type);
                if (listeners) {
                    console.log(`📤 [SSE] Emitting to ${listeners.length} listener(s) for type: ${data.type}`);
                    listeners.forEach(callback => {
                        try {
                            // Pass the full data object (backend sends { type: 'call:status:update', callId: ..., status: ..., ... })
                            callback(data);
                        } catch (error) {
                            console.error('[SSE] Listener error:', error);
                        }
                    });
                } else {
                    console.warn(`⚠️ [SSE] No listeners found for type: ${data.type}`);
                }
                
                // Emit to wildcard listeners
                const wildcardListeners = this.listeners.get('*');
                if (wildcardListeners) {
                    wildcardListeners.forEach(callback => {
                        try {
                            callback(data);
                        } catch (error) {
                            console.error('[SSE] Wildcard listener error:', error);
                        }
                    });
                }
            } catch (error) {
                console.error('[SSE] Error parsing message:', error, event.data);
            }
        };

        this.eventSource.onerror = (error) => {
            console.error('❌ [SSE] Connection error:', error);
            console.error('❌ [SSE] EventSource readyState:', this.eventSource.readyState);
            console.error('❌ [SSE] URL:', this.eventSource.url);
            
            // Log more details about the error
            if (this.eventSource.readyState === EventSource.CLOSED) {
                console.error('❌ [SSE] Connection closed by server or network error');
            } else if (this.eventSource.readyState === EventSource.CONNECTING) {
                console.error('❌ [SSE] Still trying to connect...');
            }
            
            this.eventSource.close();
            
            // Implement exponential backoff for reconnection
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = setTimeout(() => {
                console.log(`🔄 [SSE] Reconnecting in ${this.reconnectDelay}ms...`);
                this.connect(url);
            }, this.reconnectDelay);
            
            // Increase delay for next reconnection
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
        };
    }

    disconnect() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        clearTimeout(this.reconnectTimeout);
        console.log('🔌 [SSE] Disconnected');
    }
    
    isConnected() {
        return this.eventSource && this.eventSource.readyState === EventSource.OPEN;
    }
    
    getReadyState() {
        if (!this.eventSource) return 'NOT_INITIALIZED';
        switch (this.eventSource.readyState) {
            case EventSource.CONNECTING: return 'CONNECTING';
            case EventSource.OPEN: return 'OPEN';
            case EventSource.CLOSED: return 'CLOSED';
            default: return 'UNKNOWN';
        }
    }

    on(eventType, callback) {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, []);
        }
        this.listeners.get(eventType).push(callback);
        
        // Return unsubscribe function
        return () => {
            const listeners = this.listeners.get(eventType);
            if (listeners) {
                const index = listeners.indexOf(callback);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            }
        };
    }

    off(eventType, callback) {
        const listeners = this.listeners.get(eventType);
        if (listeners) {
            if (callback) {
                const index = listeners.indexOf(callback);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            } else {
                // Remove all listeners for this event type
                this.listeners.delete(eventType);
            }
        }
    }

    isConnected() {
        return this.eventSource && this.eventSource.readyState === EventSource.OPEN;
    }
}

// Create singleton instance
const sseClient = new SSEClient();

export default sseClient;
