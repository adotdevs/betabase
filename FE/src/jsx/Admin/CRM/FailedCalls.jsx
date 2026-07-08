import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    CircularProgress,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Button,
    Tooltip,
    Avatar,
    Chip,
    TextField,
    InputAdornment,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Pagination,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Checkbox,
    FormControlLabel,
} from '@mui/material';
import {
    Phone,
    Error as ErrorIcon,
    Replay,
    Delete as DeleteIcon,
    Refresh,
    Menu as MenuIcon,
    Search,
    ChevronLeft,
    ChevronRight,
    Description,
    PersonRemove as PersonRemoveIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
    getCompletedCallsApi,
    retryFailedCallApi,
    deleteCallApi,
    deleteCallsByStatusApi,
    deleteLeadApi,
    deleteLeadsBulkApi,
    bulkCallLeadsApi,
} from '../../../Api/Service';
import { allUsersApi } from '../../../Api/Service';
import { useAuthUser } from 'react-auth-kit';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar.js';
import CrmAppBarActions from './components/CrmAppBarActions';
import CallLogsModal from './components/CallLogsModal';

const FailedCalls = () => {
    const authUser = useAuthUser();
    const navigate = useNavigate();
    const [failedCalls, setFailedCalls] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isMobileMenu, setIsMobileMenu] = useState(false);
    const [retrying, setRetrying] = useState({});
    const [deletingCall, setDeletingCall] = useState(null);
    const [deleteCallConfirm, setDeleteCallConfirm] = useState(null);
    const [deleteCallWithLead, setDeleteCallWithLead] = useState(false);
    const [selectedCalls, setSelectedCalls] = useState([]); // Track selected calls for bulk actions
    const [deletingBulk, setDeletingBulk] = useState(false); // Track bulk delete in progress
    const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false); // Dialog state for bulk delete
    const [deleteBulkLeadCheckbox, setDeleteBulkLeadCheckbox] = useState(false); // Checkbox state for bulk delete lead
    const [callingBulk, setCallingBulk] = useState(false); // Track bulk call in progress
    const [deletingByStatus, setDeletingByStatus] = useState(null);
    const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
    const [deleteAllWithLeads, setDeleteAllWithLeads] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [logsCallId, setLogsCallId] = useState(null);
    const [logsModalOpen, setLogsModalOpen] = useState(false);

    // Cache of ended reasons resolved from logs endpoint (per callId)
    const [logsEndedReasons, setLogsEndedReasons] = useState({});

    // Pagination
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1
    });

    // Permission check: can view call logs
    const [canViewCallLogs, setCanViewCallLogs] = useState(true); // Default true for superadmin
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);

    // Permission gate: restrict admin without Call Dashboard access
    useEffect(() => {
        const checkPermissions = async () => {
            try {
                const me = authUser && authUser();
                const superAdmin = me?.user?.role === 'superadmin';
                setIsSuperAdmin(superAdmin);
                
                if (me?.user?.role === 'admin') {
                    const resp = await allUsersApi({ search: me.user._id, limit: 1 });
                    const updated = resp?.success && resp?.allUsers?.length ? resp.allUsers[0] : me.user;
                    if (!updated?.adminPermissions?.canAccessCallDashboard) {
                        toast.error('Access denied to Failed Calls');
                        navigate('/admin/dashboard');
                        return;
                    }
                    // Check call logs permission
                    setCanViewCallLogs(updated?.adminPermissions?.canViewCallLogs === true);
                } else if (superAdmin) {
                    // Superadmin always has permission
                    setCanViewCallLogs(true);
                } else {
                    // Subadmin or others - check their permissions
                    const resp = await allUsersApi({ search: me.user._id, limit: 1 });
                    const updated = resp?.success && resp?.allUsers?.length ? resp.allUsers[0] : me.user;
                    setCanViewCallLogs(updated?.permissions?.canViewCallLogs === true || false);
                }
            } catch (e) {
                // If check fails, default to false for safety
                setCanViewCallLogs(false);
            }
        };
        checkPermissions();
    }, []);

    // OPTIMIZED: Fetch failed calls - removed unnecessary statistics fetch
    const fetchFailedCalls = useCallback(async () => {
        try {
            setRefreshing(true);
            const params = {
                limit: pagination.limit,
                page: pagination.page,
                status: 'failed',
                includeLogs: 'true' // CRITICAL: Include logs to extract endedReason
            };

            // OPTIMIZATION: Only fetch calls data, statistics not needed on every refresh
            const failedRes = await getCompletedCallsApi(params);
            
            console.log('🔍 [fetchFailedCalls] API Response:', {
                success: failedRes.success,
                callsCount: failedRes.calls?.length || 0,
                firstCall: failedRes.calls?.[0] ? {
                    id: failedRes.calls[0]._id,
                    hasMetadata: !!failedRes.calls[0].metadata,
                    metadata: failedRes.calls[0].metadata,
                    hasLogs: !!failedRes.calls[0].logs,
                    logsLength: failedRes.calls[0].logs?.length || 0,
                    hasEndedReason: !!failedRes.calls[0].endedReason
                } : null
            });

            if (failedRes.success) {
                setFailedCalls(failedRes.calls || []);
                // Use backend pagination data (more accurate)
                if (failedRes.pagination) {
                    setPagination(prev => ({
                        ...prev,
                        total: failedRes.pagination.total || 0,
                        totalPages: failedRes.pagination.totalPages || 1
                    }));
                }
            }
        } catch (error) {
            console.error('Error fetching failed calls:', error);
            toast.error('Error loading failed calls');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [pagination.page, pagination.limit]);

    // OPTIMIZATION: Removed fetchEndedReasonForCall - use stored endedReason/duration directly from API response
    // The getResolvedEndedReason function already checks stored data first (call.endedReason, metadata.vapiEndedReason, etc.)
    // No need to call Vapi API for every call - data is already stored in database from webhooks
    
    // Cache resolved endedReason from stored data only (no API calls)
    useEffect(() => {
        failedCalls.forEach((call) => {
            const callId = call?._id;
            if (!callId) return;

            const cached = logsEndedReasons[callId];
            const localResolved = getResolvedEndedReason(call);

            // Only cache if we have a resolved reason and it's not already cached
            if (!cached && localResolved) {
                setLogsEndedReasons(prev => ({
                    ...prev,
                    [callId]: localResolved
                }));
            }
        });
    }, [failedCalls, logsEndedReasons]);

    useEffect(() => {
        fetchFailedCalls();

        // OPTIMIZED: Set up auto-refresh every 30 seconds (reduced from 10 seconds)
        const interval = setInterval(() => {
            fetchFailedCalls();
        }, 30000); // Increased to 30 seconds to reduce server load

        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pagination.page, pagination.limit]); // Only re-run when pagination changes

    const formatDateTime = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Get ended reason color based on reason type
    const getEndedReasonColor = (endedReason) => {
        if (!endedReason) return 'default';
        const reason = endedReason.toLowerCase();
        
        // Error cases
        if (reason.includes('error') || reason.includes('failed') || reason.includes('deleted') || reason.includes('not found')) {
            return 'error';
        }
        // Customer busy
        if (reason.includes('busy') || reason.includes('customer-busy')) {
            return 'warning';
        }
        // No answer cases
        if (reason.includes('did not answer') || reason.includes('no answer') || reason.includes('no-answer')) {
            return 'default';
        }
        // Voicemail
        if (reason.includes('voicemail')) {
            return 'info';
        }
        // Timeout cases
        if (reason.includes('silence') || reason.includes('timeout') || reason.includes('timed out')) {
            return 'warning';
        }
        // Customer ended
        if (reason.includes('customer ended') || reason.includes('customer-ended')) {
            return 'error';
        }
        // Assistant ended (completed successfully)
        if (reason.includes('assistant ended') || reason.includes('assistant-ended') || reason.includes('call finished') || reason.includes('completed')) {
            return 'success';
        }
        // Default for unknown reasons
        return 'default';
    };

    const resolveCallMetadata = (call) => {
        const metadata = call?.metadata || {};
        // Check multiple locations for webhook payload
        const webhookPayload = call?.webhookPayload || 
                              metadata.vapiWebhookPayload || 
                              (metadata.vapiWebhookPayload && metadata.vapiWebhookPayload.message ? metadata.vapiWebhookPayload : {}) ||
                              {};
        // Extract message payload - check both direct and nested structures
        const messagePayload = webhookPayload.message || 
                              (metadata.vapiWebhookPayload && metadata.vapiWebhookPayload.message ? metadata.vapiWebhookPayload.message : {}) ||
                              {};
        // Extract nested call object
        const nestedCall = webhookPayload.call || 
                          messagePayload.call || 
                          (webhookPayload.message && webhookPayload.message.call ? webhookPayload.message.call : {}) ||
                          {};
        // Extract artifact - check multiple locations
        const artifact = messagePayload.artifact || 
                        webhookPayload.artifact || 
                        (messagePayload.message && messagePayload.message.artifact ? messagePayload.message.artifact : {}) ||
                        (metadata.vapiWebhookPayload && metadata.vapiWebhookPayload.message && metadata.vapiWebhookPayload.message.artifact ? metadata.vapiWebhookPayload.message.artifact : {}) ||
                        {};
        return { metadata, webhookPayload, messagePayload, nestedCall, artifact };
    };

    const getResolvedEndedReason = (call) => {
        console.log('🔍 [getResolvedEndedReason] Checking call:', call._id, {
            hasEndedReason: !!call?.endedReason,
            hasMetadata: !!call?.metadata,
            hasVapiEndedReason: !!call?.metadata?.vapiEndedReason,
            hasMetadataEndedReason: !!call?.metadata?.endedReason,
            hasLogs: !!call?.logs,
            logsLength: call?.logs?.length || 0,
            hasError: !!call?.error
        });

        // PRIORITY 1: Direct call.endedReason field (if set directly)
        if (call?.endedReason) {
            console.log('✅ [getResolvedEndedReason] Found in call.endedReason:', call.endedReason);
            return call.endedReason;
        }
        
        // PRIORITY 2: Direct metadata fields (most reliable - set by webhook handler)
        if (call?.metadata?.vapiEndedReason) {
            console.log('✅ [getResolvedEndedReason] Found in metadata.vapiEndedReason:', call.metadata.vapiEndedReason);
            return call.metadata.vapiEndedReason;
        }
        if (call?.metadata?.endedReason) {
            console.log('✅ [getResolvedEndedReason] Found in metadata.endedReason:', call.metadata.endedReason);
            return call.metadata.endedReason;
        }
        
        // PRIORITY 3: Check logs array - prioritize end-of-call-report over status-update
        if (call.logs && Array.isArray(call.logs) && call.logs.length > 0) {
            console.log('🔍 [getResolvedEndedReason] Checking logs array, length:', call.logs.length);
            
            // First pass: Look for end-of-call-report type (final/definitive log)
            let endOfCallReportReason = null;
            let statusUpdateReason = null;
            let anyEndedReason = null; // Fallback: any endedReason found
            
            // Iterate from end to start (most recent logs first)
            for (let i = call.logs.length - 1; i >= 0; i--) {
                const log = call.logs[i];
                if (!log || typeof log !== 'object' || !log.data) continue;
                
                const logType = log.type || log.data?.fullPayload?.message?.type || '';
                const isEndOfCallReport = logType === 'end-of-call-report' || logType === 'call.ended';
                const isStatusUpdate = logType === 'status-update';
                
                // Extract endedReason - try direct path first (most common based on API response)
                let foundReason = null;
                
                // Check log.data.endedReason directly (CRITICAL: This is the primary path from API)
                if (log.data.endedReason) {
                    foundReason = log.data.endedReason;
                } 
                // Check log.data.fullPayload.message.endedReason
                else if (log.data.fullPayload?.message?.endedReason) {
                    foundReason = log.data.fullPayload.message.endedReason;
                }
                // Check log.data.fullPayload.message.call.endedReason
                else if (log.data.fullPayload?.message?.call?.endedReason) {
                    foundReason = log.data.fullPayload.message.call.endedReason;
                }
                
                if (foundReason) {
                    // Store based on priority
                    if (isEndOfCallReport && !endOfCallReportReason) {
                        endOfCallReportReason = foundReason;
                        console.log('✅ [getResolvedEndedReason] Found end-of-call-report endedReason:', endOfCallReportReason);
                    } else if (isStatusUpdate && !statusUpdateReason && !endOfCallReportReason) {
                        statusUpdateReason = foundReason;
                        console.log('✅ [getResolvedEndedReason] Found status-update endedReason:', statusUpdateReason);
                    } else if (!anyEndedReason && !endOfCallReportReason && !statusUpdateReason) {
                        // Fallback: store any endedReason we find (in case type doesn't match)
                        anyEndedReason = foundReason;
                        console.log('✅ [getResolvedEndedReason] Found endedReason (type:', logType, '):', anyEndedReason);
                    }
                }
            }
            
            // Return in priority order: end-of-call-report > status-update > any other
            if (endOfCallReportReason) {
                console.log('✅ [getResolvedEndedReason] Returning end-of-call-report reason:', endOfCallReportReason);
                return endOfCallReportReason;
            }
            if (statusUpdateReason) {
                console.log('✅ [getResolvedEndedReason] Returning status-update reason:', statusUpdateReason);
                return statusUpdateReason;
            }
            if (anyEndedReason) {
                console.log('✅ [getResolvedEndedReason] Returning any found endedReason:', anyEndedReason);
                return anyEndedReason;
            }
        }
        
        // PRIORITY 4: Check webhook payload structure from metadata
        const { metadata, webhookPayload, messagePayload, nestedCall } = resolveCallMetadata(call);
        
        // Check webhook payload structure (from vapiWebhookPayload)
        if (webhookPayload?.endedReason) {
            console.log('✅ [getResolvedEndedReason] Found in webhookPayload.endedReason:', webhookPayload.endedReason);
            return webhookPayload.endedReason;
        }
        if (webhookPayload?.message?.endedReason) {
            console.log('✅ [getResolvedEndedReason] Found in webhookPayload.message.endedReason:', webhookPayload.message.endedReason);
            return webhookPayload.message.endedReason;
        }
        
        // PRIORITY 5: Check message payload structure
        if (messagePayload?.endedReason) {
            console.log('✅ [getResolvedEndedReason] Found in messagePayload.endedReason:', messagePayload.endedReason);
            return messagePayload.endedReason;
        }
        
        // PRIORITY 6: Check nested call object (from webhook payload)
        if (nestedCall?.endedReason) {
            console.log('✅ [getResolvedEndedReason] Found in nestedCall.endedReason:', nestedCall.endedReason);
            return nestedCall.endedReason;
        }
        
        // PRIORITY 7: Check message.call.endedReason (deep nested)
        if (webhookPayload?.message?.call?.endedReason) {
            console.log('✅ [getResolvedEndedReason] Found in webhookPayload.message.call.endedReason:', webhookPayload.message.call.endedReason);
            return webhookPayload.message.call.endedReason;
        }
        if (messagePayload?.call?.endedReason) {
            console.log('✅ [getResolvedEndedReason] Found in messagePayload.call.endedReason:', messagePayload.call.endedReason);
            return messagePayload.call.endedReason;
        }
        
        // PRIORITY 8: Legacy error field
        if (call.error) {
            console.log('✅ [getResolvedEndedReason] Found in call.error:', call.error);
            return call.error;
        }
        
        console.log('❌ [getResolvedEndedReason] No endedReason found for call:', call._id);
        return null;
    };

    const getResolvedStartedAt = (call) => {
        // First check logs array for the most recent startedAt
        if (call.logs && Array.isArray(call.logs) && call.logs.length > 0) {
            // Find the most recent log entry with startedAt
            for (let i = call.logs.length - 1; i >= 0; i--) {
                const log = call.logs[i];
                if (log && typeof log === 'object' && log.data && log.data.startedAt) {
                    return log.data.startedAt;
                }
            }
        }
        
        const { metadata, webhookPayload, messagePayload, nestedCall, artifact } = resolveCallMetadata(call);
        return (
            call.startedAt ||
            metadata.startedAt ||
            webhookPayload.startedAt ||
            messagePayload.startedAt ||
            artifact.startedAt ||
            nestedCall.startedAt ||
            nestedCall.createdAt ||
            call.createdAt ||
            null
        );
    };

    const getResolvedEndedAt = (call) => {
        // First check logs array for the most recent endedAt
        if (call.logs && Array.isArray(call.logs) && call.logs.length > 0) {
            // Find the most recent log entry with endedAt
            for (let i = call.logs.length - 1; i >= 0; i--) {
                const log = call.logs[i];
                if (log && typeof log === 'object' && log.data && log.data.endedAt) {
                    return log.data.endedAt;
                }
            }
        }
        
        const { metadata, webhookPayload, messagePayload, nestedCall, artifact } = resolveCallMetadata(call);
        return (
            call.endedAt ||
            metadata.endedAt ||
            webhookPayload.endedAt ||
            messagePayload.endedAt ||
            artifact.endedAt ||
            nestedCall.endedAt ||
            nestedCall.updatedAt ||
            null
        );
    };

    const getResolvedDuration = (call) => {
        // First check logs array for the most recent duration
        if (call.logs && Array.isArray(call.logs) && call.logs.length > 0) {
            // Find the most recent log entry with duration
            for (let i = call.logs.length - 1; i >= 0; i--) {
                const log = call.logs[i];
                if (log && typeof log === 'object' && log.data && log.data.duration !== undefined && log.data.duration !== null) {
                    return log.data.duration;
                }
            }
        }
        
        const { metadata, webhookPayload, nestedCall } = resolveCallMetadata(call);
        return (
            call.duration ??
            metadata.vapiDuration ??
            metadata.duration ??
            webhookPayload.durationSeconds ??
            webhookPayload.duration ??
            nestedCall.duration ??
            0
        );
    };

    const handleRetryCall = async (callId) => {
        try {
            setRetrying(prev => ({ ...prev, [callId]: true }));
            const response = await retryFailedCallApi(callId);
            if (response.success) {
                toast.success(response.message || 'Call queued for retry');
                fetchFailedCalls();
            } else {
                toast.error(response.message || 'Failed to retry call');
            }
        } catch (error) {
            console.error('Error retrying call:', error);
            toast.error(error.response?.data?.msg || 'Failed to retry call');
        } finally {
            setRetrying(prev => ({ ...prev, [callId]: false }));
        }
    };

    const handleDeleteCall = async (callId, deleteLead = false) => {
        try {
            setDeletingCall(callId);
            
            // Find the call to get leadId
            const call = failedCalls.find(c => c._id === callId);
            const leadId = call?.leadId?._id || call?.leadId;
            
            // Delete call first
            const response = await deleteCallApi(callId);
            
            if (response.success) {
                let message = response.message || 'Call deleted successfully';
                
                // If deleteLead is true and leadId exists, delete the lead
                if (deleteLead && isSuperAdmin && leadId) {
                    try {
                        const leadResponse = await deleteLeadApi(leadId);
                        if (leadResponse.success) {
                            message += ' and associated lead deleted';
                        } else {
                            message += ' (but failed to delete lead)';
                        }
                    } catch (leadError) {
                        console.error('Error deleting lead:', leadError);
                        message += ' (but failed to delete lead)';
                    }
                }
                
                toast.success(message);
                fetchFailedCalls();
            } else {
                toast.error(response.message || 'Failed to delete call');
            }
        } catch (error) {
            console.error('Error deleting call:', error);
            toast.error(error.response?.data?.msg || 'Failed to delete call');
        } finally {
            setDeletingCall(null);
            setDeleteCallConfirm(null);
            setDeleteCallWithLead(false);
        }
    };

    const handleDeleteAllFailedCalls = async (deleteLeads = false) => {
        if (pagination.total === 0) {
            toast.warning('No failed calls to delete');
            return;
        }

        try {
            setDeletingByStatus('failed');
            
            // Delete ALL failed calls by status (backend handles this)
            const response = await deleteCallsByStatusApi('failed');
            
            if (response.success) {
                const deletedCount = response.deletedCount || 0;
                const totalFound = response.totalFound || deletedCount;
                
                let message = '';
                
                // If deleteLeads is true, delete associated leads
                if (deleteLeads && isSuperAdmin) {
                    // Fetch all failed calls to get their leadIds
                    try {
                        const allFailedCallsRes = await getCompletedCallsApi({
                            status: 'failed',
                            limit: 10000, // Get all failed calls
                            page: 1
                        });
                        
                        if (allFailedCallsRes.success && allFailedCallsRes.calls) {
                            // Extract unique leadIds from failed calls
                            const leadIds = allFailedCallsRes.calls
                                .map(call => call.leadId?._id || call.leadId)
                                .filter(id => id) // Remove null/undefined
                                .filter((id, index, self) => self.indexOf(id) === index); // Remove duplicates
                            
                            if (leadIds.length > 0) {
                                try {
                                    const leadResponse = await deleteLeadsBulkApi(leadIds);
                                    if (leadResponse.success) {
                                        const deletedLeadsCount = leadResponse.data?.deleted || leadIds.length;
                                        message = `Successfully deleted ${deletedCount} failed call(s) and ${deletedLeadsCount} associated lead(s)`;
                                    } else {
                                        message = `Successfully deleted ${deletedCount} failed call(s) (but failed to delete some leads)`;
                                    }
                                } catch (leadError) {
                                    console.error('Error deleting leads:', leadError);
                                    message = `Successfully deleted ${deletedCount} failed call(s) (but failed to delete leads)`;
                                }
                            } else {
                                message = `Successfully deleted ${deletedCount} failed call(s) (no associated leads found)`;
                            }
                        } else {
                            message = `Successfully deleted ${deletedCount} failed call(s) (could not fetch leads for deletion)`;
                        }
                    } catch (error) {
                        console.error('Error fetching leads for deletion:', error);
                        message = `Successfully deleted ${deletedCount} failed call(s) (but failed to fetch leads for deletion)`;
                    }
                } else {
                    // Show detailed success message
                    if (deletedCount === totalFound) {
                        message = `Successfully deleted all ${deletedCount} failed call(s)`;
                    } else {
                        message = `Deleted ${deletedCount} of ${totalFound} failed call(s). Some may have been deleted by another process.`;
                    }
                }
                
                toast.success(message);
                
                // Reset pagination and refresh
                setPagination(prev => ({ ...prev, page: 1 }));
                fetchFailedCalls();
            } else {
                toast.error(response.message || 'Failed to delete failed calls');
            }
        } catch (error) {
            console.error('Error deleting all failed calls:', error);
            toast.error(error.response?.data?.msg || error.response?.data?.message || 'Failed to delete failed calls');
        } finally {
            setDeletingByStatus(null);
            setDeleteAllWithLeads(false);
        }
    };

    // Filter failed calls by search term
    const filteredCalls = failedCalls.filter(call => {
        if (!searchTerm) return true;
        const searchLower = searchTerm.toLowerCase();
        const phoneMatch = call.phoneNumber?.toLowerCase().includes(searchLower);
        const leadMatch = call.leadId && typeof call.leadId === 'object' && (
            call.leadId.firstName?.toLowerCase().includes(searchLower) ||
            call.leadId.lastName?.toLowerCase().includes(searchLower) ||
            call.leadId.email?.toLowerCase().includes(searchLower)
        );
        return phoneMatch || leadMatch;
    });

    // Handle bulk delete
    const handleBulkDelete = async (deleteLeads = false) => {
        if (selectedCalls.length === 0) {
            toast.warning('Please select calls to delete');
            return;
        }

        try {
            setDeletingBulk(true);
            const deletePromises = selectedCalls.map(callId => deleteCallApi(callId));
            const results = await Promise.allSettled(deletePromises);

            const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failed = results.length - successful;

            if (successful > 0) {
                toast.success(`Successfully deleted ${successful} call(s)`);
                
                // Delete leads if checkbox was checked
                if (deleteLeads && isSuperAdmin) {
                    const leadIdsToDelete = new Set();
                    
                    selectedCalls.forEach(callId => {
                        const call = failedCalls.find(c => c._id === callId);
                        if (call?.leadId) {
                            const leadId = typeof call.leadId === 'object' ? (call.leadId._id || call.leadId) : call.leadId;
                            if (leadId) leadIdsToDelete.add(leadId);
                        }
                    });
                    
                    if (leadIdsToDelete.size > 0) {
                        try {
                            const leadDeletePromises = Array.from(leadIdsToDelete).map(leadId => deleteLeadApi(leadId));
                            const leadResults = await Promise.allSettled(leadDeletePromises);
                            const successfulLeads = leadResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
                            const failedLeads = leadIdsToDelete.size - successfulLeads;
                            
                            if (successfulLeads > 0) {
                                toast.success(`Successfully deleted ${successfulLeads} lead(s)`);
                            }
                            if (failedLeads > 0) {
                                toast.warning(`Failed to delete ${failedLeads} lead(s)`);
                            }
                        } catch (leadError) {
                            console.error('Error deleting leads:', leadError);
                            toast.warning('Calls deleted but some leads failed to delete');
                        }
                    }
                }
                
                fetchFailedCalls();
            }
            if (failed > 0) {
                toast.error(`Failed to delete ${failed} call(s)`);
            }

            setSelectedCalls([]);
            setDeleteBulkLeadCheckbox(false);
        } catch (error) {
            console.error('Error bulk deleting calls:', error);
            toast.error('Error deleting calls');
        } finally {
            setDeletingBulk(false);
        }
    };

    // Handle bulk retry/call
    const handleBulkRetry = async () => {
        if (selectedCalls.length === 0) {
            toast.warning('Please select calls to retry');
            return;
        }

        try {
            setCallingBulk(true);
            
            // Extract leadIds from selected calls
            const leadIds = [];
            selectedCalls.forEach(callId => {
                const call = failedCalls.find(c => c._id === callId);
                if (call?.leadId && call?.phoneNumber) {
                    const leadId = typeof call.leadId === 'object' ? (call.leadId._id || call.leadId) : call.leadId;
                    if (leadId) leadIds.push(leadId);
                }
            });

            if (leadIds.length === 0) {
                toast.error('Selected calls have no valid leads or phone numbers');
                return;
            }

            const response = await bulkCallLeadsApi(leadIds, { delay: 5000 });
            if (response.success) {
                toast.success(`Queued ${response.calls?.length || leadIds.length} calls for retry`);
                setSelectedCalls([]);
                fetchFailedCalls();
            } else {
                toast.error(response.message || 'Failed to queue calls');
            }
        } catch (error) {
            console.error('Error bulk retrying calls:', error);
            toast.error(error.response?.data?.msg || 'Failed to queue calls');
        } finally {
            setCallingBulk(false);
        }
    };

    // Handle select all checkbox
    const handleSelectAll = (checked) => {
        if (checked) {
            const allCallIds = filteredCalls.map(call => call._id);
            setSelectedCalls(allCallIds);
        } else {
            setSelectedCalls([]);
        }
    };

    // Handle individual checkbox
    const handleSelectCall = (callId, checked) => {
        if (checked) {
            setSelectedCalls(prev => [...prev, callId]);
        } else {
            setSelectedCalls(prev => prev.filter(id => id !== callId));
        }
    };

    useEffect(() => {
        if (authUser().user.role === "admin" || authUser().user.role === "superadmin") {
            return;
        } else if (authUser().user.role === "user") {
            navigate("/dashboard");
            return;
        } else {
            navigate("/admin/dashboard");
            return;
        }
    }, []);

    return (
        <Box
            sx={{
                display: 'flex',
                height: '100vh',
                overflow: 'hidden',
            }}
        >
            {/* Sidebar */}
            <Sidebar
                setisMobileMenu={setIsMobileMenu}
                isMobileMenu={isMobileMenu}
                isCollapsed={isSidebarCollapsed}
                setIsSidebarCollapsed={setIsSidebarCollapsed}
            />

            {/* Mobile Menu Overlay */}
            {isMobileMenu && (
                <Box
                    onClick={() => setIsMobileMenu(false)}
                    sx={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        zIndex: 1199,
                        display: { xs: 'block', md: 'none' },
                        cursor: 'pointer'
                    }}
                />
            )}

            {/* Main Content */}
            <Box
                component="main"
                sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    ml: {
                        xs: 0,
                        md: isSidebarCollapsed ? '0' : '0',
                    },
                    transition: 'margin-left 0.3s ease',
                    height: '100vh',
                    overflow: 'auto',
                }}
            >
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Box sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <IconButton
                                    onClick={() => setIsMobileMenu(!isMobileMenu)}
                                    sx={{
                                        color: 'text.primary',
                                        display: { xs: 'block', md: 'none' },
                                    }}
                                >
                                    <MenuIcon />
                                </IconButton>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <ErrorIcon color="error" />
                                    <Typography variant="h4" sx={{ fontWeight: 700 }}>
                                        Failed Calls
                                    </Typography>
                                    {pagination.total > 0 && (
                                        <Chip
                                            label={pagination.total}
                                            color="error"
                                            sx={{ fontWeight: 600, fontSize: '0.875rem', height: 28 }}
                                        />
                                    )}
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                <CrmAppBarActions />
                                <TextField
                                    size="small"
                                    placeholder="Search phone/lead..."
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setSelectedCalls([]); // Clear selection when search changes
                                    }}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <Search sx={{ fontSize: 18 }} />
                                            </InputAdornment>
                                        ),
                                    }}
                                    sx={{ minWidth: 200 }}
                                />
                                {selectedCalls.length > 0 && (
                                    <>
                                        <Button
                                            variant="contained"
                                            size="small"
                                            color="primary"
                                            startIcon={callingBulk ? <CircularProgress size={16} /> : <Replay />}
                                            onClick={handleBulkRetry}
                                            disabled={callingBulk}
                                        >
                                            {callingBulk ? 'Retrying...' : `Retry Selected (${selectedCalls.length})`}
                                        </Button>
                                        <Button
                                            variant="contained"
                                            size="small"
                                            color="error"
                                            startIcon={deletingBulk ? <CircularProgress size={16} /> : <DeleteIcon />}
                                            onClick={() => {
                                                setBulkDeleteDialogOpen(true);
                                                setDeleteBulkLeadCheckbox(false);
                                            }}
                                            disabled={deletingBulk}
                                        >
                                            {deletingBulk ? 'Deleting...' : `Delete Selected (${selectedCalls.length})`}
                                        </Button>
                                    </>
                                )}
                                <Button
                                    variant="outlined"
                                    color="error"
                                    size="small"
                                    startIcon={deletingByStatus === 'failed' ? <CircularProgress size={16} /> : <DeleteIcon />}
                                    onClick={() => {
                                        setDeleteAllDialogOpen(true);
                                        setDeleteAllWithLeads(false); // Reset checkbox when opening dialog
                                    }}
                                    disabled={deletingByStatus === 'failed' || pagination.total === 0}
                                >
                                    {deletingByStatus === 'failed' ? 'Deleting...' : 'Delete All'}
                                </Button>
                                <Button
                                    variant="outlined"
                                    startIcon={refreshing ? <CircularProgress size={16} /> : <Refresh />}
                                    onClick={fetchFailedCalls}
                                    disabled={refreshing}
                                >
                                    Refresh
                                </Button>
                            </Box>
                        </Box>

                        {/* Failed Calls Table */}
                        {filteredCalls.length > 0 ? (
                            <Card elevation={3} sx={{ borderRadius: 3, border: '2px solid', borderColor: 'error.light', bgcolor: 'error.50' }}>
                                <CardContent>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            {pagination.total} failed call(s) found
                                        </Typography>
                                        <Chip
                                            label="Retry Available"
                                            color="error"
                                            size="small"
                                            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                                        />
                                    </Box>
                                    <TableContainer>
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow sx={{ bgcolor: 'error.50' }}>
                                                    <TableCell padding="checkbox" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                                                        <Checkbox
                                                            indeterminate={selectedCalls.length > 0 && selectedCalls.length < filteredCalls.length}
                                                            checked={filteredCalls.length > 0 && filteredCalls.every(call => selectedCalls.includes(call._id))}
                                                            onChange={(e) => handleSelectAll(e.target.checked)}
                                                        />
                                                    </TableCell>
                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Lead</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Phone</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Ended Reason</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Retry Attempts</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Failed At</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem', textAlign: 'center' }}>Actions</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {filteredCalls.map((call) => {
                                                    const cacheEndedReason = logsEndedReasons[call._id] || null;
                                                    const derived = {
                                                        endedReason: cacheEndedReason || getResolvedEndedReason(call),
                                                        startedAt: getResolvedStartedAt(call),
                                                        endedAt: getResolvedEndedAt(call),
                                                        durationSeconds: getResolvedDuration(call),
                                                    };
                                                    return (
                                                    <TableRow key={call._id} hover>
                                                        <TableCell padding="checkbox">
                                                            <Checkbox
                                                                checked={selectedCalls.includes(call._id)}
                                                                onChange={(e) => handleSelectCall(call._id, e.target.checked)}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            {call.leadId ? (
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                    <Avatar sx={{ width: 28, height: 28, fontSize: '0.7rem' }}>
                                                                        {call.leadId.firstName?.[0]}{call.leadId.lastName?.[0]}
                                                                    </Avatar>
                                                                    <Box>
                                                                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                                                                            {call.leadId.firstName} {call.leadId.lastName}
                                                                        </Typography>
                                                                        <Typography variant="caption" color="text.secondary">
                                                                            {call.leadId.email}
                                                                        </Typography>
                                                                    </Box>
                                                                </Box>
                                                            ) : (
                                                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                                                                    Unknown Lead
                                                                </Typography>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                <Phone sx={{ fontSize: 14, color: 'text.secondary' }} />
                                                                <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                                                                    {call.phoneNumber}
                                                                </Typography>
                                                            </Box>
                                                        </TableCell>
                                                        <TableCell>
                                                            {derived.endedReason ? (
                                                                <Chip
                                                                    label={derived.endedReason}
                                                                    size="small"
                                                                    color={getEndedReasonColor(derived.endedReason)}
                                                                    sx={{
                                                                        fontWeight: 700,
                                                                        fontSize: '0.75rem',
                                                                        maxWidth: 200,
                                                                        '& .MuiChip-label': {
                                                                            overflow: 'hidden',
                                                                            textOverflow: 'ellipsis',
                                                                            whiteSpace: 'nowrap'
                                                                        }
                                                                    }}
                                                                />
                                                            ) : call.error ? (
                                                                <Chip
                                                                    label={call.error}
                                                                    size="small"
                                                                    color="error"
                                                                    sx={{ fontWeight: 600, fontSize: '0.75rem', maxWidth: 200 }}
                                                                />
                                                            ) : (
                                                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem', fontStyle: 'italic' }}>
                                                                    No reason available
                                                                </Typography>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Chip
                                                                label={`${call.metadata?.retryAttempts || 0}/5`}
                                                                size="small"
                                                                color={(call.metadata?.retryAttempts || 0) >= 5 ? 'error' : 'warning'}
                                                                sx={{ fontWeight: 600 }}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                                                                {formatDateTime(derived.endedAt)}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell sx={{ textAlign: 'center' }}>
                                                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                                                {canViewCallLogs && (
                                                                    <Tooltip title="View Call Logs">
                                                                        <span>
                                                                            <IconButton
                                                                                size="small"
                                                                                color="default"
                                                                                onClick={() => {
                                                                                    setLogsCallId(call._id);
                                                                                    setLogsModalOpen(true);
                                                                                }}
                                                                            >
                                                                                <Description fontSize="small" />
                                                                            </IconButton>
                                                                        </span>
                                                                    </Tooltip>
                                                                )}
                                                                <Tooltip title={(call.metadata?.retryAttempts || 0) >= 5 ? 'Max retries reached' : 'Retry Call'}>
                                                                    <span>
                                                                        <IconButton
                                                                            size="small"
                                                                            color="primary"
                                                                            onClick={() => handleRetryCall(call._id)}
                                                                            disabled={retrying[call._id] || (call.metadata?.retryAttempts || 0) >= 5}
                                                                        >
                                                                            {retrying[call._id] ? (
                                                                                <CircularProgress size={20} />
                                                                            ) : (
                                                                                <Replay />
                                                                            )}
                                                                        </IconButton>
                                                                    </span>
                                                                </Tooltip>
                                                                <Tooltip title="Delete Call">
                                                                    <IconButton
                                                                        size="small"
                                                                        color="error"
                                                                        onClick={() => setDeleteCallConfirm(call._id)}
                                                                        disabled={deletingCall === call._id}
                                                                    >
                                                                        {deletingCall === call._id ? (
                                                                            <CircularProgress size={16} />
                                                                        ) : (
                                                                            <DeleteIcon fontSize="small" />
                                                                        )}
                                                                    </IconButton>
                                                                </Tooltip>
                                                            </Box>
                                                        </TableCell>
                                                    </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>

                                    {canViewCallLogs && (
                                        <CallLogsModal
                                            callId={logsCallId}
                                            open={logsModalOpen}
                                            onClose={() => {
                                                setLogsModalOpen(false);
                                                setLogsCallId(null);
                                            }}
                                        />
                                    )}

                                    {/* Pagination */}
                                    {pagination.totalPages > 1 && (
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                                            <Typography variant="body2" color="text.secondary">
                                                Showing {((pagination.page - 1) * pagination.limit) + 1}-
                                                {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                                            </Typography>
                                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                                <FormControl size="small" sx={{ minWidth: 80 }}>
                                                    <Select
                                                        value={pagination.limit}
                                                        onChange={(e) => {
                                                            setPagination(prev => ({ ...prev, limit: e.target.value, page: 1 }));
                                                        }}
                                                    >
                                                        <MenuItem value={10}>10</MenuItem>
                                                        <MenuItem value={20}>20</MenuItem>
                                                        <MenuItem value={50}>50</MenuItem>
                                                        <MenuItem value={100}>100</MenuItem>
                                                    </Select>
                                                </FormControl>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                                                    disabled={pagination.page === 1}
                                                >
                                                    <ChevronLeft />
                                                </IconButton>
                                                <Typography variant="body2">
                                                    Page {pagination.page} of {pagination.totalPages}
                                                </Typography>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => setPagination(prev => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))}
                                                    disabled={pagination.page >= pagination.totalPages}
                                                >
                                                    <ChevronRight />
                                                </IconButton>
                                            </Box>
                                        </Box>
                                    )}
                                </CardContent>
                            </Card>
                        ) : (
                            <Card elevation={3} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                                <CardContent>
                                    <Box sx={{ textAlign: 'center', py: 8 }}>
                                        <ErrorIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                                        <Typography variant="h6" color="text.secondary" gutterBottom>
                                            {searchTerm ? 'No Matching Failed Calls' : 'No Failed Calls'}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {searchTerm ? 'Try adjusting your search criteria' : 'All calls have been successful or no calls have failed yet'}
                                        </Typography>
                                    </Box>
                                </CardContent>
                            </Card>
                        )}

                        {/* Delete Single Call Confirmation Dialog */}
                        <Dialog
                            open={deleteCallConfirm !== null}
                            onClose={() => !deletingCall && (setDeleteCallConfirm(null), setDeleteCallWithLead(false))}
                            maxWidth="sm"
                            fullWidth
                        >
                            <DialogTitle>
                                <Box display="flex" alignItems="center" gap={1}>
                                    <DeleteIcon color="error" />
                                    <Typography variant="h6">Delete Failed Call</Typography>
                                </Box>
                            </DialogTitle>
                            <DialogContent>
                                <Typography variant="body1" sx={{ mb: 2 }}>
                                    Are you sure you want to delete this failed call? This action cannot be undone.
                                </Typography>
                                
                                {(() => {
                                    const call = failedCalls.find(c => c._id === deleteCallConfirm);
                                    const hasLead = call?.leadId?._id || call?.leadId;
                                    
                                    if (hasLead && isSuperAdmin) {
                                        const leadName = call.leadId?.firstName && call.leadId?.lastName
                                            ? `${call.leadId.firstName} ${call.leadId.lastName}`
                                            : call.leadId?.email || 'Unknown Lead';
                                        
                                        return (
                                            <Box
                                                sx={{
                                                    p: 2,
                                                    borderRadius: 2,
                                                    bgcolor: 'warning.light',
                                                    border: '1px solid',
                                                    borderColor: 'warning.main',
                                                    mt: 2
                                                }}
                                            >
                                                <FormControlLabel
                                                    control={
                                                        <Checkbox
                                                            checked={deleteCallWithLead}
                                                            onChange={(e) => setDeleteCallWithLead(e.target.checked)}
                                                            color="warning"
                                                        />
                                                    }
                                                    label={
                                                        <Box>
                                                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                                                Also delete associated lead
                                                            </Typography>
                                                            <Typography variant="caption" color="text.secondary" display="block">
                                                                Lead: {leadName}
                                                            </Typography>
                                                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                                                                This will permanently remove the lead from the system
                                                            </Typography>
                                                        </Box>
                                                    }
                                                />
                                            </Box>
                                        );
                                    }
                                    return null;
                                })()}
                            </DialogContent>
                            <DialogActions>
                                <Button 
                                    onClick={() => {
                                        setDeleteCallConfirm(null);
                                        setDeleteCallWithLead(false);
                                    }} 
                                    disabled={deletingCall}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="contained"
                                    color="error"
                                    onClick={() => handleDeleteCall(deleteCallConfirm, deleteCallWithLead)}
                                    disabled={deletingCall}
                                    startIcon={deletingCall ? <CircularProgress size={20} /> : <DeleteIcon />}
                                >
                                    {deletingCall ? 'Deleting...' : 'Delete Call'}
                                </Button>
                            </DialogActions>
                        </Dialog>

                        {/* Delete All Failed Calls Confirmation Dialog */}
                        <Dialog
                            open={deleteAllDialogOpen}
                            onClose={() => !deletingByStatus && setDeleteAllDialogOpen(false)}
                            maxWidth="sm"
                            fullWidth
                        >
                            <DialogTitle>
                                <Box display="flex" alignItems="center" gap={1}>
                                    <DeleteIcon color="error" />
                                    <Typography variant="h6">Delete All Failed Calls</Typography>
                                </Box>
                            </DialogTitle>
                            <DialogContent onClick={(e) => e.stopPropagation()}>
                                <Typography variant="body1" sx={{ mb: 2 }}>
                                    Are you sure you want to delete <strong>ALL {pagination.total} failed call(s)</strong> in the system?
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    This will delete all failed calls (not just the ones on this page). This action cannot be undone.
                                </Typography>
                                
                                {isSuperAdmin && (
                                <Box
                                    sx={{
                                        p: 2,
                                        borderRadius: 2,
                                        bgcolor: 'warning.light',
                                        border: '1px solid',
                                        borderColor: 'warning.main',
                                        mt: 2
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={deleteAllWithLeads}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    setDeleteAllWithLeads(e.target.checked);
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                color="warning"
                                            />
                                        }
                                        onClick={(e) => e.stopPropagation()}
                                        label={
                                            <Box onClick={(e) => e.stopPropagation()}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                                    <PersonRemoveIcon sx={{ fontSize: 18 }} />
                                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                        Also delete all associated leads
                                                    </Typography>
                                                </Box>
                                                <Typography variant="caption" color="text.secondary" display="block">
                                                    This will permanently remove all leads associated with failed calls from the system
                                                </Typography>
                                            </Box>
                                        }
                                    />
                                </Box>
                                )}
                            </DialogContent>
                            <DialogActions>
                                <Button 
                                    onClick={() => {
                                        setDeleteAllDialogOpen(false);
                                        setDeleteAllWithLeads(false);
                                    }} 
                                    disabled={deletingByStatus === 'failed'}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="contained"
                                    color="error"
                                    onClick={() => {
                                        handleDeleteAllFailedCalls(deleteAllWithLeads);
                                        setDeleteAllDialogOpen(false);
                                    }}
                                    disabled={deletingByStatus === 'failed'}
                                    startIcon={deletingByStatus === 'failed' ? <CircularProgress size={20} /> : <DeleteIcon />}
                                >
                                    {deletingByStatus === 'failed' ? 'Deleting...' : 'Delete All'}
                                </Button>
                            </DialogActions>
                        </Dialog>

                        {/* Bulk Delete Confirmation Dialog */}
                        <Dialog
                            open={bulkDeleteDialogOpen}
                            onClose={() => !deletingBulk && setBulkDeleteDialogOpen(false)}
                            maxWidth="sm"
                            fullWidth
                        >
                            <DialogTitle>
                                <Box display="flex" alignItems="center" gap={1}>
                                    <DeleteIcon color="error" />
                                    <Typography variant="h6">Confirm Bulk Delete</Typography>
                                </Box>
                            </DialogTitle>
                            <DialogContent>
                                <Typography sx={{ mb: 2 }}>
                                    Are you sure you want to delete {selectedCalls.length} call(s)? This action cannot be undone.
                                </Typography>
                                {(() => {
                                    const hasAnyLead = selectedCalls.some(callId => {
                                        const call = failedCalls.find(c => c._id === callId);
                                        return call?.leadId;
                                    });
                                    return hasAnyLead && isSuperAdmin ? (
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                                            <Checkbox
                                                checked={deleteBulkLeadCheckbox}
                                                onChange={(e) => setDeleteBulkLeadCheckbox(e.target.checked)}
                                                disabled={deletingBulk}
                                            />
                                            <Typography variant="body2">
                                                Also delete the leads from the system
                                            </Typography>
                                        </Box>
                                    ) : null;
                                })()}
                            </DialogContent>
                            <DialogActions>
                                <Button onClick={() => {
                                    setBulkDeleteDialogOpen(false);
                                    setDeleteBulkLeadCheckbox(false);
                                }} disabled={deletingBulk}>
                                    Cancel
                                </Button>
                                <Button
                                    variant="contained"
                                    color="error"
                                    onClick={() => {
                                        handleBulkDelete(deleteBulkLeadCheckbox);
                                        setBulkDeleteDialogOpen(false);
                                    }}
                                    disabled={deletingBulk}
                                    startIcon={deletingBulk ? <CircularProgress size={20} /> : <DeleteIcon />}
                                >
                                    {deletingBulk ? 'Deleting...' : 'Delete'}
                                </Button>
                            </DialogActions>
                        </Dialog>
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default FailedCalls;

