import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Grid,
    Chip,
    CircularProgress,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Button,
    Stack,
    LinearProgress,
    Divider,
    Tooltip,
    Avatar,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    InputAdornment,
    Checkbox,
    Tabs,
    Tab,
    Accordion,
    AccordionSummary,
    AccordionDetails,
} from '@mui/material';
import {
    Phone,
    PhoneInTalk,
    PhoneCallback,
    PhoneDisabled,
    CheckCircle,
    Cancel,
    Stop,
    Schedule,
    AccessTime,
    Timer,
    TrendingUp,
    People,
    Refresh,
    PlayArrow,
    Pause,
    Menu as MenuIcon,
    KeyboardArrowRight,
    History,
    Error as ErrorIcon,
    Replay,
    Delete as DeleteIcon,
    Search,
    ChevronLeft,
    ChevronRight,
    Download,
    Visibility,
    ArrowUpward,
    ArrowDownward,
    NavigateBefore,
    NavigateNext,
    Description,
    ExpandMore,
    SmartToy,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
    getCallStatisticsApi,
    getActiveCallsApi,
    getCallQueueStatusApi,
    cancelCallApi,
    pauseCallQueueApi,
    resumeCallQueueApi,
    getCompletedCallsApi,
    deleteCallApi,
    deleteCallsByStatusApi,
    getCallLogsApi,
    deleteCallsBulkApi,
} from '../../../Api/Service';
import { allUsersApi, deleteLeadApi } from '../../../Api/Service';
import { useAuthUser } from 'react-auth-kit';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar.js';
import { mapSipEventsToStatus } from '../../../utils/callStatus';
import sseClient from '../../../utils/sseClient';
import DarkModeToggle from '../../../components/DarkModeToggle';
import CallLogsModal from './components/CallLogsModal';
import { getBackendUrl } from '../../../config/appConfig';

const CallDashboard = () => {
    const authUser = useAuthUser();
    const navigate = useNavigate(); 
    const finalizedSessionsRef = useRef({}); 
    const [statistics, setStatistics] = useState(null);
    const [activeCalls, setActiveCalls] = useState([]);
    const [queueStatus, setQueueStatus] = useState(null);
    const [completedCalls, setCompletedCalls] = useState([]);
    const [cancelledCalls, setCancelledCalls] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isMobileMenu, setIsMobileMenu] = useState(false);
    const [pausing, setPausing] = useState(false);
    const [deletingCall, setDeletingCall] = useState(null);
    const [deleteCallConfirm, setDeleteCallConfirm] = useState(null);
    const [deleteLeadCheckbox, setDeleteLeadCheckbox] = useState(false); // Checkbox state for deleting lead
    const [deleteBulkLeadCheckbox, setDeleteBulkLeadCheckbox] = useState(false); // Checkbox state for bulk delete lead
    const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false); // Dialog state for bulk delete
    const [deletingByStatus, setDeletingByStatus] = useState(null); // Track which status is being deleted
    const [selectedCalls, setSelectedCalls] = useState([]); // Track selected calls for bulk delete
    const [deletingBulk, setDeletingBulk] = useState(false); // Track bulk delete in progress
    const [logsCallId, setLogsCallId] = useState(null); // Track which call's logs to display
    const [logsModalOpen, setLogsModalOpen] = useState(false); // Track logs modal open state

    // Pagination for completed calls
    const [completedCallsPagination, setCompletedCallsPagination] = useState({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1
    });

    // Filters for completed calls
    const [callFilters, setCallFilters] = useState({
        status: 'completed', // completed, failed, or 'all'
        search: '',
        dateRange: '', // 'today', 'week', 'month', 'all'
        sortBy: 'endedAt', // 'endedAt', 'duration', 'phoneNumber'
        sortOrder: 'desc' // 'asc', 'desc'
    });

    // Call details modal
    const [selectedCall, setSelectedCall] = useState(null);
    const [callDetailsOpen, setCallDetailsOpen] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0); // Trigger for manual refreshes
    const [callLogs, setCallLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [logsError, setLogsError] = useState(null);
    const [vapiCallDetails, setVapiCallDetails] = useState(null);

    // Call Summary Carousel
    const [summaryCarouselIndex, setSummaryCarouselIndex] = useState(0);
    const [callsWithSummaries, setCallsWithSummaries] = useState([]);
    const [summaryPagination, setSummaryPagination] = useState({
        page: 1,
        limit: 10, // Show 10 summaries per page in carousel
        total: 0,
        totalPages: 1
    });
    const [loadingSummaries, setLoadingSummaries] = useState(false);
    const [activeContentView, setActiveContentView] = useState('summary'); // 'summary' or 'transcript'

    // Permission check: can view call logs
    const [canViewCallLogs, setCanViewCallLogs] = useState(true); // Default true for superadmin

    // Cache of ended reasons resolved from logs endpoint (per callId)
    const [logsEndedReasons, setLogsEndedReasons] = useState({});

    // Permission gate: restrict admin without Call Dashboard access
    useEffect(() => {
        const checkPermissions = async () => {
            try {
                const me = authUser && authUser();
                const isSuperAdmin = me?.user?.role === 'superadmin';
                
                if (me?.user?.role === 'admin') {
                    const resp = await allUsersApi({ search: me.user._id, limit: 1 });
                    const updated = resp?.success && resp?.allUsers?.length ? resp.allUsers[0] : me.user;
                    if (!updated?.adminPermissions?.canAccessCallDashboard) {
                        toast.error('Access denied to Call Dashboard');
                        navigate('/admin/dashboard');
                        return;
                    }
                    // Check call logs permission
                    setCanViewCallLogs(updated?.adminPermissions?.canViewCallLogs === true);
                } else if (isSuperAdmin) {
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

    // SSE connection for real-time updates
    useEffect(() => {
        // Use centralized configuration for backend URL
        const backendUrl = getBackendUrl();

        // OPTIMIZATION: Reduced logging for performance
        // Connect to SSE endpoint (async)
        sseClient.connect(`${backendUrl}/api/v1/crm/call/updates/sse`).catch(err => {
            console.error('Failed to connect SSE:', err);
        });

        // OPTIMIZED: Throttle SSE updates to prevent UI freezing during bulk calls
        let updateQueue = [];
        let isProcessingUpdates = false;
        const UPDATE_BATCH_INTERVAL = 100; // Reduced from 500ms to 100ms for faster updates
        
        const processUpdateQueue = () => {
            if (isProcessingUpdates || updateQueue.length === 0) return;
            
            isProcessingUpdates = true;
            const updates = updateQueue.splice(0); // Clear queue
            
            // Batch process all queued updates
            setActiveCalls(prev => {
                const updatedCalls = [...prev];
                const finalizedSessions = new Set();
                let hasStatusChanges = false; // Track if any status changed
                
                updates.forEach(data => {
                    // Extract the actual data (SSE client now passes the full data object)
                    const updateData = data;
                    const sessionId = updateData.sessionId;
                    const callId = updateData.callId;
                    const status = updateData.status;
                    
                    if (!sessionId && !callId) {
                        console.warn('⚠️ [SSE] Update missing sessionId/callId:', updateData);
                        return;
                    }
                    
                    const callIndex = updatedCalls.findIndex(c =>
                        c.sessionId === sessionId || c._id === callId
                    );

                    if (callIndex >= 0) {
                        // Update existing call
                        const oldStatus = updatedCalls[callIndex].status;
                        const updatedCall = {
                            ...updatedCalls[callIndex],
                            status: status,
                            metadata: {
                                ...updatedCalls[callIndex].metadata,
                                sipEvents: updateData.sipEvents || updateData.metadata?.sipEvents || [],
                                sipStatus: updateData.sipStatus || updateData.metadata?.sipStatus
                            }
                        };

                        // Apply status mapping
                        updatedCall.status = mapSipEventsToStatus(
                            status,
                            updatedCall.metadata.sipEvents,
                            updatedCall.metadata.sipStatus
                        );
                        
                        // Track status changes
                        if (oldStatus !== updatedCall.status) {
                            hasStatusChanges = true;
                            console.log(`🔄 [SSE] Status changed: ${oldStatus} → ${updatedCall.status} (${sessionId || callId})`);
                        }

                        // Remove if completed/failed/cancelled/no-answer (any terminal status)
                        if (['completed', 'failed', 'cancelled', 'no-answer'].includes(updatedCall.status)) {
                            if (sessionId) {
                                finalizedSessions.add(sessionId);
                            }
                            updatedCalls.splice(callIndex, 1);
                        } else {
                            updatedCalls[callIndex] = updatedCall;
                        }
                    } else {
                        // Call not in activeCalls yet - add it if it's an active status
                        const activeStatuses = ['ringing', 'in-progress', 'initiating'];
                        if (activeStatuses.includes(status)) {
                            console.log(`➕ [SSE] Adding new active call: ${status} (${sessionId || callId})`);
                            hasStatusChanges = true;
                            
                            // Create a new call object from the update data
                            const newCall = {
                                _id: callId,
                                sessionId: sessionId,
                                status: mapSipEventsToStatus(
                                    status,
                                    updateData.sipEvents || updateData.metadata?.sipEvents || [],
                                    updateData.sipStatus || updateData.metadata?.sipStatus
                                ),
                                phoneNumber: updateData.phoneNumber,
                                leadId: updateData.leadId,
                                startedAt: updateData.startedAt || new Date(),
                                metadata: {
                                    sipEvents: updateData.sipEvents || updateData.metadata?.sipEvents || [],
                                    sipStatus: updateData.sipStatus || updateData.metadata?.sipStatus
                                }
                            };
                            
                            updatedCalls.push(newCall);
                        }
                    }
                });
                
                // Update finalized sessions ref
                finalizedSessions.forEach(sessionId => {
                    finalizedSessionsRef.current[sessionId] = true;
                });
                
                // Trigger refresh if there were finalized calls OR status changes
                if (finalizedSessions.size > 0 || hasStatusChanges) {
                    setRefreshTrigger(prev => prev + 1);
                }
                
                return updatedCalls;
            });
            
            isProcessingUpdates = false;
            
            // Process remaining updates if any
            if (updateQueue.length > 0) {
                setTimeout(processUpdateQueue, UPDATE_BATCH_INTERVAL);
            }
        };
        
        // Listen for call status updates - OPTIMIZED: Batch updates during bulk calls
        const unsubscribe = sseClient.on('call:status:update', (data) => {
            console.log('📥 [SSE] Received call:status:update:', data);
            
            // Add to update queue instead of processing immediately
            updateQueue.push(data);
            
            // Start processing if not already processing
            if (!isProcessingUpdates) {
                setTimeout(processUpdateQueue, UPDATE_BATCH_INTERVAL);
            }
        });

        return () => {
            sseClient.disconnect();
            unsubscribe();
        };
    }, []); // Only run once on mount

    // Fetch all data
    const fetchDashboardData = useCallback(async () => {
        try {
            setRefreshing(true);

            // Build completed calls query params
            const completedParams = {
                limit: completedCallsPagination.limit,
                page: completedCallsPagination.page,
                status: callFilters.status === 'all' ? undefined : callFilters.status
            };

            // Optimize: Fetch all critical data in parallel
            const [statsRes, activeRes, queueRes, completedRes] = await Promise.all([
                getCallStatisticsApi(),
                getActiveCallsApi(),
                getCallQueueStatusApi(),
                getCompletedCallsApi(completedParams),
            ]);
            
            // Fetch cancelled calls in parallel after getting stats (if needed)
            let cancelledRes = { success: false, calls: [] };
            if (statsRes?.success && statsRes?.statistics?.byStatus) {
                const cancelledStats = statsRes.statistics.byStatus.find(s => s._id === 'cancelled');
                if (cancelledStats && cancelledStats.count > 0) {
                    try {
                        cancelledRes = await getCompletedCallsApi({ limit: 20, page: 1, status: 'cancelled' });
                    } catch (err) {
                        // Ignore cancelled calls fetch error - not critical
                        cancelledRes = { success: false, calls: [] };
                    }
                }
            }

            if (statsRes?.success) {
                setStatistics(statsRes.statistics);
            }
            if (activeRes?.success) {
                // Map status based on SIP events and current status (optimized - minimal logging)
                const mappedActiveCalls = (activeRes.calls || []).map(call => ({
                    ...call,
                    status: mapSipEventsToStatus(
                        call.status,
                        call.metadata?.sipEvents,
                        call.metadata?.sipStatus
                    )
                }));

                // Filter out any sessions we've already finalized (prevents re-adding)
                const filteredActive = mappedActiveCalls.filter(c => {
                    const sid = c.sessionId || c._id;
                    return !sid || !finalizedSessionsRef.current[sid];
                });
                setActiveCalls(filteredActive);
            }
            if (queueRes?.success) {
                setQueueStatus(queueRes.queue);
            }
            if (completedRes?.success) {
                // CRITICAL: Filter out 'no-answer', 'failed', and 'cancelled' calls from completed calls list
                // Also exclude calls with no-answer endedReasons (backend should filter, but this is a safety measure)
                const noAnswerPatterns = ['customer-did-not-answer', 'did-not-answer', 'customer-busy', 'busy', 'voicemail'];
                const validCompletedCalls = (completedRes.calls || []).filter(call => {
                    if (call.status !== 'completed') return false;
                    // Exclude calls with no-answer endedReasons
                    const endedReason = call.endedReason || call.metadata?.vapiEndedReason || call.metadata?.endedReason || '';
                    const endedReasonLower = endedReason.toLowerCase();
                    const isNoAnswer = noAnswerPatterns.some(pattern => endedReasonLower.includes(pattern.toLowerCase()));
                    return !isNoAnswer;
                });
                setCompletedCalls(validCompletedCalls);
                // FIX: Use backend pagination data, not filtered count
                if (completedRes.pagination) {
                    setCompletedCallsPagination(prev => ({
                        ...prev,
                        total: completedRes.pagination.total || 0,
                        totalPages: completedRes.pagination.totalPages || 1
                    }));
                }
            }
            
            // Handle cancelled calls from parallel fetch
            if (cancelledRes?.success && cancelledRes.calls) {
                setCancelledCalls(cancelledRes.calls);
            }
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            toast.error('Error loading dashboard data');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [completedCallsPagination.page, completedCallsPagination.limit, callFilters.status]);

    // Fetch all summaries page by page without skipping any
    // This function fetches all pages sequentially to ensure no summaries are missed
    const fetchAllSummaries = useCallback(async () => {
        try {
            setLoadingSummaries(true);
            const allSummaries = [];
            let currentPage = 1;
            const pageSize = 50; // Fetch 50 calls per page for efficiency
            let hasMorePages = true;
            let totalCallsProcessed = 0;

            // Fetch all pages until no more calls are returned
            while (hasMorePages) {
                const response = await getCompletedCallsApi({
                    page: currentPage,
                    limit: pageSize,
                    status: 'completed',
                    includeTranscript: 'true'
                });

                if (response.success && response.calls && response.calls.length > 0) {
                    // Filter for calls with summaries only
                    const summariesInPage = response.calls.filter(call => {
                        return call.summary && call.summary.trim().length > 0;
                    });

                    // Add all summaries found in this page
                    allSummaries.push(...summariesInPage);
                    totalCallsProcessed += response.calls.length;

                    // Check if there are more pages
                    const pagination = response.pagination || {};
                    const totalPages = pagination.totalPages || 1;
                    hasMorePages = currentPage < totalPages;

                    // Move to next page
                    currentPage++;

                    // Safety limit: stop after 100 pages to prevent infinite loops
                    if (currentPage > 100) {
                        console.warn('Reached safety limit of 100 pages for summaries');
                        hasMorePages = false;
                    }
                } else {
                    // No more calls or error
                    hasMorePages = false;
                }
            }

            // Sort all summaries by endedAt descending (most recent first)
            allSummaries.sort((a, b) => {
                const dateA = new Date(a.endedAt || a.createdAt || 0);
                const dateB = new Date(b.endedAt || b.createdAt || 0);
                return dateB - dateA;
            });

            // Update state with all summaries
            setCallsWithSummaries(allSummaries);

            // Update pagination with actual totals
            const displayLimit = summaryPagination.limit;
            const totalPages = Math.ceil(allSummaries.length / displayLimit) || 1;

            setSummaryPagination(prev => ({
                ...prev,
                total: allSummaries.length,
                totalPages: totalPages,
                page: 1 // Reset to first page
            }));

            // Reset carousel to first item
            setSummaryCarouselIndex(0);

            toast.success(`Loaded ${allSummaries.length} call summaries`);
        } catch (error) {
            console.error('Error fetching all summaries:', error);
            toast.error('Error loading call summaries');
        } finally {
            setLoadingSummaries(false);
        }
    }, [summaryPagination.limit]);

    // OPTIMIZED: Load summaries on-demand (lazy loading) - only fetch one page at a time
    // This prevents loading hundreds of summaries at once which slows down the system
    const fetchSummariesPage = useCallback(async (page = 1, limit = 10) => {
        try {
            setLoadingSummaries(true);
            
            // OPTIMIZATION: Only fetch one page of completed calls with summaries
            const response = await getCompletedCallsApi({
                page: page,
                limit: limit * 2, // Fetch 2x limit to find summaries (some calls may not have summaries)
                status: 'completed', // Only get completed calls which are more likely to have summaries
                includeTranscript: 'true' // Include transcript field to show transcript button when available
            });

            if (response.success && response.calls) {
                // Filter for calls with summaries only
                const summaries = response.calls.filter(call => {
                    return call.summary && call.summary.trim().length > 0;
                });
                
                // Sort by endedAt descending (most recent first)
                summaries.sort((a, b) => {
                    const dateA = new Date(a.endedAt || a.createdAt || 0);
                    const dateB = new Date(b.endedAt || b.createdAt || 0);
                    return dateB - dateA;
                });

                // Update only current page summaries (replace or append based on page)
                if (page === 1) {
                    setCallsWithSummaries(summaries.slice(0, limit));
                } else {
                    setCallsWithSummaries(prev => {
                        const startIndex = (page - 1) * limit;
                        const newSummaries = [...prev];
                        summaries.slice(0, limit).forEach((summary, idx) => {
                            newSummaries[startIndex + idx] = summary;
                        });
                        return newSummaries;
                    });
                }

                // Update pagination - use actual count if available, otherwise estimate
                const estimatedTotal = response.pagination?.total ? 
                    Math.ceil(response.pagination.total * 0.3) : // Estimate ~30% have summaries
                    summaries.length;
                const totalPages = Math.ceil(estimatedTotal / limit) || 1;

                setSummaryPagination(prev => ({
                    ...prev,
                    total: estimatedTotal,
                    totalPages: totalPages,
                    page: page
                }));
            }
        } catch (error) {
            console.error('Error fetching summaries page:', error);
            // Don't show error toast - summaries are optional
        } finally {
            setLoadingSummaries(false);
        }
    }, []);

    // OPTIMIZED: Only load first page of summaries when user first views the summary section
    // Load additional pages on-demand when user navigates
    const loadSummaryPageIfNeeded = useCallback((page) => {
        const startIndex = (page - 1) * summaryPagination.limit;
        const endIndex = startIndex + summaryPagination.limit;
        
        // Check if we have data for this page
        const hasData = callsWithSummaries.slice(startIndex, endIndex).some(call => call !== undefined && call !== null);
        
        if (!hasData && !loadingSummaries) {
            fetchSummariesPage(page, summaryPagination.limit);
        }
    }, [callsWithSummaries, summaryPagination.limit, loadingSummaries, fetchSummariesPage]);

    // Sync pagination page when carousel index changes significantly - OPTIMIZED: Load page on-demand
    useEffect(() => {
        if (callsWithSummaries.length > 0 && summaryPagination.limit > 0) {
            const currentPage = Math.floor(summaryCarouselIndex / summaryPagination.limit) + 1;
            if (currentPage !== summaryPagination.page && currentPage >= 1 && currentPage <= summaryPagination.totalPages) {
                setSummaryPagination(prev => ({ ...prev, page: currentPage }));
                // Load page if needed
                loadSummaryPageIfNeeded(currentPage);
            }
        }
    }, [summaryCarouselIndex, callsWithSummaries.length, summaryPagination.limit, summaryPagination.page, summaryPagination.totalPages, loadSummaryPageIfNeeded]);

    useEffect(() => {
        fetchDashboardData();

        // OPTIMIZED: Set up auto-refresh every 10 seconds (reduced from 5 seconds for better performance)
        // OPTIMIZED: Only refresh if dashboard is still mounted and visible, and not during heavy bulk operations
        const interval = setInterval(() => {
            if (!loading && !refreshing && activeCalls.length < 50) { // Skip refresh if too many active calls (bulk operation)
                fetchDashboardData();
            }
        }, 20000); // Increased to 20 seconds to reduce load during bulk operations

        return () => clearInterval(interval);
    }, [fetchDashboardData, refreshTrigger]); // Added refreshTrigger to re-run when needed

    // OPTIMIZATION: Removed fetchEndedReasonForCall - use stored endedReason/duration directly from API response
    // The getResolvedEndedReason function already checks stored data first (call.endedReason, metadata.vapiEndedReason, etc.)
    // No need to call Vapi API for every call - data is already stored in database from webhooks
    
    // Cache resolved endedReason from stored data only (no API calls)
    useEffect(() => {
        const allCalls = [
            ...(completedCalls || []),
            ...(cancelledCalls || []),
            ...(callsWithSummaries || []),
        ];
        const seen = new Set();

        allCalls.forEach((call) => {
            const callId = call?._id;
            if (!callId || seen.has(callId)) return;
            seen.add(callId);

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
    }, [completedCalls, cancelledCalls, callsWithSummaries, logsEndedReasons]);

    // Update live duration for active calls every second
    useEffect(() => {
        if (activeCalls.length === 0) return;

        const durationInterval = setInterval(() => {
            setActiveCalls(prev => {
                return prev.map(call => {
                    // Update duration for in-progress or ringing calls
                    if ((call.status === 'in-progress' || call.status === 'ringing') && call.startedAt) {
                        const now = new Date();
                        const started = new Date(call.startedAt);
                        const duration = Math.floor((now - started) / 1000);
                        return {
                            ...call,
                            liveDuration: duration,
                            liveDurationFormatted: formatDuration(duration)
                        };
                    }
                    return call;
                });
            });
        }, 1000);

        return () => clearInterval(durationInterval);
    }, [activeCalls.length]);

    // ❌ REMOVED: Socket.io - replaced with polling in fetchDashboardData (every 5 seconds)
    // All updates now come from the regular polling interval

    const handleCancelCall = async (sessionId) => {
        try {
            const response = await cancelCallApi(sessionId);
            if (response.success) {
                toast.success('Call cancelled');
                fetchDashboardData();
            } else {
                toast.error(response.message || 'Failed to cancel call');
            }
        } catch (error) {
            console.error('Error cancelling call:', error);
            toast.error('Error cancelling call');
        }
    };

    const handlePauseQueue = async () => {
        try {
            setPausing(true);
            const response = await pauseCallQueueApi();
            if (response.success) {
                toast.success('Call queue paused');
                fetchDashboardData();
            } else {
                toast.error(response.message || 'Failed to pause queue');
            }
        } catch (error) {
            console.error('Error pausing queue:', error);
            toast.error('Error pausing queue');
        } finally {
            setPausing(false);
        }
    };

    const handleResumeQueue = async () => {
        try {
            setPausing(true);
            const response = await resumeCallQueueApi();
            if (response.success) {
                toast.success('Call queue resumed');
                fetchDashboardData();
            } else {
                toast.error(response.message || 'Failed to resume queue');
            }
        } catch (error) {
            console.error('Error resuming queue:', error);
            toast.error('Error resuming queue');
        } finally {
            setPausing(false);
        }
    };


    const handleDeleteCallsByStatus = async (status) => {
        if (!window.confirm(`Are you sure you want to delete all ${status} calls? This action cannot be undone.`)) {
            return;
        }

        try {
            setDeletingByStatus(status);
            const response = await deleteCallsByStatusApi(status);
            if (response.success) {
                const deletedCount = response.deletedCount || 0;
                toast.success(`Successfully deleted ${deletedCount} ${status} call(s)`);
                // Update UI immediately
                setCompletedCalls(prev => prev.filter(c => c.status !== status));
                setCancelledCalls(prev => prev.filter(c => c.status !== status));
                // Remove deleted calls from summaries (if status is completed)
                if (status === 'completed') {
                    setCallsWithSummaries(prev => prev.filter(c => c.status !== status));
                }
                // Clear selected calls
                setSelectedCalls([]);
                // Update statistics
                if (statistics) {
                    setStatistics(prev => ({
                        ...prev,
                        total: Math.max(0, (prev.total || 0) - deletedCount),
                        [status]: Math.max(0, (prev[status] || 0) - deletedCount)
                    }));
                }
                // Refresh summaries if completed calls were deleted
                if (status === 'completed') {
                    setRefreshTrigger(prev => prev + 1);
                }
            } else {
                toast.error(response.message || `Failed to delete ${status} calls`);
            }
        } catch (error) {
            console.error(`Error deleting ${status} calls:`, error);
            toast.error(error.response?.data?.msg || `Failed to delete ${status} calls`);
        } finally {
            setDeletingByStatus(null);
        }
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '0:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        return `${minutes}:${String(secs).padStart(2, '0')}`;
    };

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

    const hasWebhookEvidence = (call = {}) => {
        const metadata = call.metadata || {};
        return Boolean(
            metadata.vapiWebhookPayload ||
            metadata.vapiEndedReason ||
            metadata.finalizedAt ||
            metadata.vapiSource === 'webhook' ||
            (call.logs && call.logs.length > 0)
        );
    };

    const resolveCallStatus = (call) => {
        if (!call) return 'unknown';
        const baseStatus = call.status || call.metadata?.vapiStatus || 'unknown';
        if ((baseStatus === 'ringing' || baseStatus === 'in-progress') && !hasWebhookEvidence(call)) {
            return baseStatus === 'ringing' ? 'dialing' : 'awaiting-webhook';
        }
        return baseStatus;
    };

    const getStatusLabel = (status) => {
        switch (status) {
            case 'awaiting-webhook':
                return 'Awaiting Vapi Logs';
            case 'dialing':
                return 'Dialing';
            case 'in-progress':
                return 'In Progress';
            case 'ringing':
                return 'Ringing';
            case 'completed':
                return 'Completed';
            case 'failed':
                return 'Failed';
            case 'cancelled':
                return 'Cancelled';
            case 'no-answer':
                return 'No Answer';
            case 'queued':
                return 'Queued';
            case 'initiating':
                return 'Initiating';
            case 'scheduled':
                return 'Scheduled';
            default:
                return status?.replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase()) || 'Unknown';
        }
    };

    const getStatusChipColor = (status) => {
        switch (status) {
            case 'awaiting-webhook':
                return 'warning';
            case 'dialing':
                return 'info';
            case 'in-progress':
                return 'info';
            case 'completed':
                return 'success';
            case 'failed':
                return 'error';
            case 'no-answer':
                return 'error';
            case 'cancelled':
                return 'default';
            case 'queued':
            case 'initiating':
            case 'scheduled':
                return 'default';
            default:
                return 'default';
        }
    };

    const resolveCallMetadata = (call = {}) => {
        const metadata = call?.metadata || {};
        const webhookPayload = call?.webhookPayload || metadata.vapiWebhookPayload || {};
        const messagePayload = webhookPayload.message || {};
        const nestedCall = webhookPayload.call || messagePayload.call || {};
        const artifact = messagePayload.artifact || webhookPayload.artifact || {};
        return { metadata, webhookPayload, messagePayload, nestedCall, artifact };
    };

    const getResolvedEndedReason = (call) => {
        if (!call) return null;

        const cached = logsEndedReasons[call._id];
        if (cached) return cached;
        
        // PRIORITY 1: Direct call.endedReason field (fastest - now populated synchronously by backend)
        if (call.endedReason) {
            return call.endedReason;
        }
        
        // PRIORITY 2: Direct metadata fields (most reliable - set by webhook handler)
        if (call.metadata?.vapiEndedReason) {
            return call.metadata.vapiEndedReason;
        }
        if (call.metadata?.endedReason) {
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
        
        // PRIORITY 4: Check webhook payload structure
        const { metadata, webhookPayload, messagePayload, nestedCall } = resolveCallMetadata(call);
        
        // Check webhook payload structure (from vapiWebhookPayload)
        if (webhookPayload?.endedReason) {
            return webhookPayload.endedReason;
        }
        if (webhookPayload?.message?.endedReason) {
            return webhookPayload.message.endedReason;
        }
        
        // PRIORITY 5: Check message payload structure
        if (messagePayload?.endedReason) {
            return messagePayload.endedReason;
        }
        
        // PRIORITY 6: Check nested call object (from webhook payload)
        if (nestedCall?.endedReason) {
            return nestedCall.endedReason;
        }
        
        // PRIORITY 7: Check message.call.endedReason (deep nested)
        if (webhookPayload?.message?.call?.endedReason) {
            return webhookPayload.message.call.endedReason;
        }
        if (messagePayload?.call?.endedReason) {
            return messagePayload.call.endedReason;
        }
        
        // PRIORITY 7: Legacy error field
        if (call.error) {
            return call.error;
        }
        
        return null;
    };

    const getResolvedStartedAt = (call) => {
        if (!call) return null;
        
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
        return call.startedAt ||
            metadata.startedAt ||
            webhookPayload.startedAt ||
            messagePayload.startedAt ||
            artifact.startedAt ||
            nestedCall.startedAt ||
            nestedCall.createdAt ||
            call.createdAt ||
            null;
    };

    const getResolvedEndedAt = (call) => {
        if (!call) return null;
        
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
        return call.endedAt ||
            metadata.endedAt ||
            webhookPayload.endedAt ||
            messagePayload.endedAt ||
            artifact.endedAt ||
            nestedCall.endedAt ||
            nestedCall.updatedAt ||
            null;
    };

    const getResolvedDuration = (call) => {
        if (!call) return 0;
        
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
        return call.duration ??
            metadata.vapiDuration ??
            metadata.duration ??
            webhookPayload.durationSeconds ??
            webhookPayload.duration ??
            nestedCall.duration ??
            0;
    };

    // Helper function to extract structured outputs from call data
    const getStructuredOutputs = (call) => {
        if (!call) return [];
        
        try {
            // Check multiple locations for structured outputs
            const { metadata, webhookPayload, messagePayload, artifact } = resolveCallMetadata(call);
            
            // DEBUG: Log all potential locations for structured outputs
            console.log('🔍 [getStructuredOutputs] Checking call:', call._id, {
                hasMetadata: !!metadata,
                hasWebhookPayload: !!webhookPayload,
                hasMessagePayload: !!messagePayload,
                hasArtifact: !!artifact,
                metadataKeys: metadata ? Object.keys(metadata) : [],
                artifactKeys: artifact ? Object.keys(artifact) : [],
                webhookPayloadKeys: webhookPayload ? Object.keys(webhookPayload) : []
            });
            
            // Try to find structured outputs in various locations
            let structuredOutputs = null;
            let foundLocation = null;
            
            // Check metadata.structuredOutputs (if stored directly)
            if (metadata?.structuredOutputs) {
                structuredOutputs = metadata.structuredOutputs;
                foundLocation = 'metadata.structuredOutputs';
            }
            // Check artifact.structuredOutputs
            else if (artifact?.structuredOutputs) {
                structuredOutputs = artifact.structuredOutputs;
                foundLocation = 'artifact.structuredOutputs';
            }
            // Check webhookPayload.message.artifact.structuredOutputs
            else if (webhookPayload?.message?.artifact?.structuredOutputs) {
                structuredOutputs = webhookPayload.message.artifact.structuredOutputs;
                foundLocation = 'webhookPayload.message.artifact.structuredOutputs';
            }
            // Check messagePayload.artifact.structuredOutputs
            else if (messagePayload?.artifact?.structuredOutputs) {
                structuredOutputs = messagePayload.artifact.structuredOutputs;
                foundLocation = 'messagePayload.artifact.structuredOutputs';
            }
            // Check webhookPayload.artifact.structuredOutputs
            else if (webhookPayload?.artifact?.structuredOutputs) {
                structuredOutputs = webhookPayload.artifact.structuredOutputs;
                foundLocation = 'webhookPayload.artifact.structuredOutputs';
            }
            // Check if structured outputs are in the artifact object directly (as keys)
            else if (artifact && typeof artifact === 'object') {
                // Check if artifact itself is structured outputs (UUID keys with name/result)
                const artifactKeys = Object.keys(artifact);
                if (artifactKeys.length > 0) {
                    const firstKey = artifactKeys[0];
                    const firstValue = artifact[firstKey];
                    // Check if it matches the structured output format: { uuid: { name: "...", result: ... } }
                    if (firstValue && typeof firstValue === 'object' && (firstValue.name || firstValue.result !== undefined)) {
                        structuredOutputs = artifact;
                        foundLocation = 'artifact (direct)';
                    }
                }
            }
            
            // DEBUG: Log what we found
            if (structuredOutputs) {
                console.log('✅ [getStructuredOutputs] Found structured outputs at:', foundLocation, structuredOutputs);
            } else {
                console.log('❌ [getStructuredOutputs] No structured outputs found. Full artifact:', artifact);
                console.log('❌ [getStructuredOutputs] Full webhookPayload:', webhookPayload);
            }
            
            // If we found structured outputs, convert to array format
            if (structuredOutputs && typeof structuredOutputs === 'object') {
                // Handle the format: { "uuid": { "name": "...", "result": ... } }
                const outputs = [];
                for (const [key, value] of Object.entries(structuredOutputs)) {
                    if (value && typeof value === 'object') {
                        outputs.push({
                            id: key,
                            name: value.name || key,
                            result: value.result
                        });
                    }
                }
                console.log('✅ [getStructuredOutputs] Extracted outputs:', outputs);
                return outputs;
            }
        } catch (error) {
            console.error('❌ [getStructuredOutputs] Error extracting structured outputs:', error);
        }
        
        return [];
    };

    const currentSummaryCall = callsWithSummaries.length > 0
        ? callsWithSummaries[Math.min(summaryCarouselIndex, callsWithSummaries.length - 1)]
        : null;
    const currentSummaryEndedReason = currentSummaryCall ? getResolvedEndedReason(currentSummaryCall) : null;
    const currentSummaryStartedAt = currentSummaryCall ? (getResolvedStartedAt(currentSummaryCall) || currentSummaryCall.startedAt) : null;
    const currentSummaryEndedAt = currentSummaryCall ? (getResolvedEndedAt(currentSummaryCall) || currentSummaryCall.endedAt) : null;
    const currentSummaryDuration = currentSummaryCall ? (getResolvedDuration(currentSummaryCall) || currentSummaryCall.duration || 0) : 0;
    const currentSummaryStructuredOutputs = currentSummaryCall ? getStructuredOutputs(currentSummaryCall) : [];
    // Check if transcript exists - match the exact same check used in display logic (line 2087)
    const hasTranscript = callsWithSummaries.length > 0 && 
                          summaryCarouselIndex >= 0 && 
                          summaryCarouselIndex < callsWithSummaries.length &&
                          callsWithSummaries[summaryCarouselIndex] &&
                          callsWithSummaries[summaryCarouselIndex].transcript &&
                          (
                              (typeof callsWithSummaries[summaryCarouselIndex].transcript === 'string' && callsWithSummaries[summaryCarouselIndex].transcript.trim().length > 0) ||
                              (typeof callsWithSummaries[summaryCarouselIndex].transcript === 'object' && callsWithSummaries[summaryCarouselIndex].transcript.messages && Array.isArray(callsWithSummaries[summaryCarouselIndex].transcript.messages) && callsWithSummaries[summaryCarouselIndex].transcript.messages.length > 0)
                          );
    const selectedCallDerived = selectedCall ? {
        endedReason: getResolvedEndedReason(selectedCall),
        startedAt: getResolvedStartedAt(selectedCall),
        endedAt: getResolvedEndedAt(selectedCall),
        durationSeconds: getResolvedDuration(selectedCall),
    } : null;

    // const handleViewCallHistory = (leadId) => {
    //     // Donot change the link its /admin/admin keep it as it is
    //     window.open(`/admin/crm/lead/${leadId}/stream`, '_blank');
    // }; 
    const handleViewCallHistory = (leadId) => {
        // Get the full pathname from window (always includes basename)
        const fullPathname = window.location.pathname; 
        // Check if we're already under /admin path
        // If pathname starts with /admin/admin, we need to add /admin prefix
        // If pathname starts with /admin (single), we don't need prefix
        // If pathname doesn't start with /admin, basename is /admin, so we need prefix
        const needsAdminPrefix = fullPathname.startsWith('/admin/admin') || !fullPathname.startsWith('/admin');
        const basePath = needsAdminPrefix ? '/admin' : '';
        
        const fullPath = `${basePath}/admin/crm/lead/${leadId}/stream`;
        window.open(fullPath, '_blank');
    };

    // Handle pagination change
    const handlePageChange = (newPage) => {
        setCompletedCallsPagination(prev => ({ ...prev, page: newPage }));
    };

    const handleDeleteCall = async (callId, deleteLead = false) => {
        try {
            setDeletingCall(callId);
            
            // Find the call to get leadId
            const callToDelete = [...completedCalls, ...cancelledCalls, ...callsWithSummaries].find(c => c._id === callId);
            const leadId = callToDelete?.leadId ? (typeof callToDelete.leadId === 'object' ? callToDelete.leadId._id || callToDelete.leadId : callToDelete.leadId) : null;
            
            // Delete call
            const response = await deleteCallApi(callId);
            if (response.success) {
                toast.success(response.message || 'Call deleted successfully');
                
                // Delete lead if checkbox was checked
                if (deleteLead && leadId) {
                    try {
                        const leadResponse = await deleteLeadApi(leadId);
                        if (leadResponse.success) {
                            toast.success('Lead deleted successfully');
                        } else {
                            toast.warning('Call deleted but failed to delete lead: ' + (leadResponse.message || 'Unknown error'));
                        }
                    } catch (leadError) {
                        console.error('Error deleting lead:', leadError);
                        toast.warning('Call deleted but failed to delete lead: ' + (leadError.response?.data?.msg || leadError.message || 'Unknown error'));
                    }
                }
                
                // Update UI immediately
                setCompletedCalls(prev => prev.filter(c => c._id !== callId));
                setCancelledCalls(prev => prev.filter(c => c._id !== callId));
                // Remove from summaries if it was there
                setCallsWithSummaries(prev => prev.filter(c => c._id !== callId));
                // Remove from selected if it was selected
                setSelectedCalls(prev => prev.filter(id => id !== callId));
                // Update statistics
                if (statistics) {
                    setStatistics(prev => ({
                        ...prev,
                        total: Math.max(0, (prev.total || 0) - 1),
                        completed: prev.completed && callId ? Math.max(0, prev.completed - 1) : prev.completed
                    }));
                }
                // Refresh summaries
                setRefreshTrigger(prev => prev + 1);
            } else {
                toast.error(response.message || 'Failed to delete call');
            }
        } catch (error) {
            console.error('Error deleting call:', error);
            toast.error(error.response?.data?.msg || 'Failed to delete call');
        } finally {
            setDeletingCall(null);
            setDeleteCallConfirm(null);
            setDeleteLeadCheckbox(false);
        }
    };

    // Handle delete ALL scheduled calls (all 15k+ scheduled calls, not just pending)
    const handleDeleteAllScheduledCalls = async () => {
        const totalScheduled = queueStatus?.totalScheduled || 0;

        if (totalScheduled === 0) {
            toast.warning('No scheduled calls to delete');
            return;
        }

        if (!window.confirm(`⚠️ WARNING: Are you sure you want to delete ALL ${totalScheduled.toLocaleString()} scheduled call(s)?\n\nThis will delete:\n- All pending calls in queue\n- All future scheduled calls\n\nThis action cannot be undone!`)) {
            return;
        }

        try {
            setDeletingByStatus('scheduled');
            const response = await deleteCallsByStatusApi('scheduled');
            if (response.success) {
                const deletedCount = response.deletedCount || 0;
                toast.success(`Successfully deleted ${deletedCount.toLocaleString()} scheduled call(s)`);
                // Refresh dashboard data
                fetchDashboardData();
                // Update statistics
                if (statistics) {
                    setStatistics(prev => ({
                        ...prev,
                        total: Math.max(0, (prev.total || 0) - deletedCount)
                    }));
                }
            } else {
                toast.error(response.message || 'Failed to delete scheduled calls');
            }
        } catch (error) {
            console.error('Error deleting all scheduled calls:', error);
            toast.error(error.response?.data?.msg || 'Failed to delete scheduled calls');
        } finally {
            setDeletingByStatus(null);
        }
    };

    // Handle bulk delete
    const handleBulkDelete = async (deleteLeads = false) => {
        if (selectedCalls.length === 0) {
            toast.warning('Please select calls to delete');
            return;
        }

        if (!window.confirm(`Are you sure you want to delete ${selectedCalls.length} call(s)? This action cannot be undone.`)) {
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
                if (deleteLeads) {
                    const allCalls = [...completedCalls, ...cancelledCalls];
                    const leadIdsToDelete = new Set();
                    
                    selectedCalls.forEach(callId => {
                        const call = allCalls.find(c => c._id === callId);
                        if (call?.leadId) {
                            const leadId = typeof call.leadId === 'object' ? call.leadId._id || call.leadId : call.leadId;
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
                
                // Update UI immediately
                setCompletedCalls(prev => prev.filter(c => !selectedCalls.includes(c._id)));
                setCancelledCalls(prev => prev.filter(c => !selectedCalls.includes(c._id)));
                // Update statistics
                if (statistics) {
                    setStatistics(prev => ({
                        ...prev,
                        total: Math.max(0, (prev.total || 0) - successful)
                    }));
                }
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

    // Handle select all checkbox
    const handleSelectAll = (checked) => {
        if (checked) {
            const allCallIds = completedCalls
                .filter(call => {
                    // Apply same filters as table
                    if (callFilters.search) {
                        const searchLower = callFilters.search.toLowerCase();
                        const phoneMatch = call.phoneNumber?.toLowerCase().includes(searchLower);
                        const leadMatch = typeof call.leadId === 'object' && (
                            call.leadId.firstName?.toLowerCase().includes(searchLower) ||
                            call.leadId.lastName?.toLowerCase().includes(searchLower) ||
                            call.leadId.email?.toLowerCase().includes(searchLower)
                        );
                        if (!phoneMatch && !leadMatch) return false;
                    }
                    if (callFilters.dateRange && call.endedAt) {
                        const callDate = new Date(call.endedAt);
                        const now = new Date();
                        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        if (callFilters.dateRange === 'today' && callDate < todayStart) return false;
                        if (callFilters.dateRange === 'week') {
                            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                            if (callDate < weekAgo) return false;
                        }
                        if (callFilters.dateRange === 'month') {
                            const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                            if (callDate < monthAgo) return false;
                        }
                    }
                    return true;
                })
                .map(call => call._id);
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

    // Export calls to CSV
    const handleExportCalls = () => {
        try {
            // Get all filtered calls (not just current page)
            const filteredCalls = completedCalls.filter(call => {
                // Apply search filter
                if (callFilters.search) {
                    const searchLower = callFilters.search.toLowerCase();
                    const phoneMatch = call.phoneNumber?.toLowerCase().includes(searchLower);
                    const leadMatch = typeof call.leadId === 'object' && (
                        call.leadId.firstName?.toLowerCase().includes(searchLower) ||
                        call.leadId.lastName?.toLowerCase().includes(searchLower) ||
                        call.leadId.email?.toLowerCase().includes(searchLower)
                    );
                    if (!phoneMatch && !leadMatch) return false;
                }

                // Apply date range filter
                if (callFilters.dateRange && call.endedAt) {
                    const callDate = new Date(call.endedAt);
                    const now = new Date();
                    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                    if (callFilters.dateRange === 'today' && callDate < todayStart) return false;
                    if (callFilters.dateRange === 'week') {
                        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                        if (callDate < weekAgo) return false;
                    }
                    if (callFilters.dateRange === 'month') {
                        const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                        if (callDate < monthAgo) return false;
                    }
                }

                return true;
            });

            // Sort calls
            const sortedCalls = [...filteredCalls].sort((a, b) => {
                let aValue, bValue;

                switch (callFilters.sortBy) {
                    case 'duration':
                        aValue = a.duration || 0;
                        bValue = b.duration || 0;
                        break;
                    case 'phoneNumber':
                        aValue = a.phoneNumber || '';
                        bValue = b.phoneNumber || '';
                        break;
                    case 'endedAt':
                    default:
                        aValue = new Date(a.endedAt || a.createdAt || 0).getTime();
                        bValue = new Date(b.endedAt || b.createdAt || 0).getTime();
                        break;
                }

                if (callFilters.sortOrder === 'asc') {
                    return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
                } else {
                    return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
                }
            });

            // Build CSV content
            const headers = ['Lead Name', 'Lead Email', 'Phone Number', 'Status', 'Duration (seconds)', 'Duration (formatted)', 'Started At', 'Ended At', 'Ringing Time (seconds)', 'Active Call Time (seconds)', 'Summary'];
            const rows = sortedCalls.map(call => {
                const leadName = typeof call.leadId === 'object'
                    ? `${call.leadId.firstName || ''} ${call.leadId.lastName || ''}`.trim()
                    : 'Unknown Lead';
                const leadEmail = typeof call.leadId === 'object' ? (call.leadId.email || '') : '';
                const durationFormatted = formatDuration(call.duration || 0);
                const startedAt = call.startedAt ? formatDateTime(call.startedAt) : '';
                const endedAt = call.endedAt ? formatDateTime(call.endedAt) : '';
                const ringingTime = call.ringingTime || 0;
                const activeCallTime = call.activeCallTime || 0;
                const summary = call.summary || '';

                return [
                    leadName,
                    leadEmail,
                    call.phoneNumber || '',
                    call.status || '',
                    call.duration || 0,
                    durationFormatted,
                    startedAt,
                    endedAt,
                    ringingTime,
                    activeCallTime,
                    summary.replace(/\n/g, ' ').replace(/,/g, ';') // Replace commas and newlines for CSV
                ];
            });

            // Create CSV string
            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
            ].join('\n');

            // Download CSV
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `calls_export_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast.success(`Exported ${sortedCalls.length} call(s) to CSV`);
        } catch (error) {
            console.error('Error exporting calls:', error);
            toast.error('Failed to export calls');
        }
    };

    // Handle sort
    const handleSort = (sortBy) => {
        setCallFilters(prev => ({
            ...prev,
            sortBy,
            sortOrder: prev.sortBy === sortBy && prev.sortOrder === 'desc' ? 'asc' : 'desc'
        }));
    };

    // Get sort icon
    const getSortIcon = (column) => {
        if (callFilters.sortBy !== column) return null;
        return callFilters.sortOrder === 'asc' ? <ArrowUpward sx={{ fontSize: 16 }} /> : <ArrowDownward sx={{ fontSize: 16 }} />;
    };

    // Get ended reason color based on reason type
    const getEndedReasonColor = (endedReason) => {
        if (!endedReason) return 'default';
        const reason = endedReason.toLowerCase();
        
        // Error cases
        if (reason.includes('error') || reason.includes('failed') || reason.includes('deleted')) {
            return 'error';
        }
        // Customer busy
        if (reason.includes('busy') || reason.includes('customer-busy')) {
            return 'warning';
        }
        // No answer cases
        if (reason.includes('did not answer') || reason.includes('no answer') || reason.includes('no-answer')|| reason.includes('did-not-answer')) {
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

    // Open call details modal
    const handleViewCallDetails = async (call) => {
        setSelectedCall(call);
        setCallDetailsOpen(true);
        setCallLogs([]);
        setLogsError(null);
        setVapiCallDetails(null);
        
        // OPTIMIZATION: Only fetch logs if user has permission and explicitly wants to see logs
        // Use stored logs by default (no Vapi API call) to prevent rate limits
        if (canViewCallLogs && call.metadata?.vapiCallId) {
            setLoadingLogs(true);
            try {
                // Use stored logs by default - no Vapi API call
                const response = await getCallLogsApi(call._id, { fetchFromVapi: 'false' });
                if (response.success) {
                    setCallLogs(response.logs || []);
                    setVapiCallDetails(response.callDetails || null);
                } else {
                    // Don't show error if it's just a permission issue - silently fail
                    if (!response.message?.includes('permission')) {
                        setLogsError(response.message || 'Failed to load logs');
                    }
                }
            } catch (error) {
                // Don't show error if it's a permission issue - silently fail to prevent infinite loops
                if (!error.message?.includes('permission') && !error.response?.data?.message?.includes('permission')) {
                    console.error('Error fetching call logs:', error);
                    setLogsError(error.message || 'Failed to load logs');
                }
            } finally {
                setLoadingLogs(false);
            }
        }
    };

    // Navigate summary carousel with pagination - OPTIMIZED: Load pages on-demand
    const handlePreviousSummary = () => {
        setSummaryCarouselIndex(prev => {
            if (prev > 0) {
                const newIndex = prev - 1;
                const newPage = Math.floor(newIndex / summaryPagination.limit) + 1;
                // Load page if needed
                loadSummaryPageIfNeeded(newPage);
                return newIndex;
            } else {
                // Go to previous page
                const currentPage = Math.floor(prev / summaryPagination.limit) + 1;
                if (currentPage > 1) {
                    const prevPage = currentPage - 1;
                    setSummaryPagination(prevPagination => ({
                        ...prevPagination,
                        page: prevPage
                    }));
                    // Load previous page if needed
                    loadSummaryPageIfNeeded(prevPage);
                    return (prevPage - 1) * summaryPagination.limit + (summaryPagination.limit - 1);
                }
                return callsWithSummaries.length - 1; // Wrap to last item
            }
        });
    };

    const handleNextSummary = () => {
        setSummaryCarouselIndex(prev => {
            if (prev < callsWithSummaries.length - 1) {
                const currentPage = Math.floor(prev / summaryPagination.limit) + 1;
                const itemsInCurrentPage = Math.min(
                    summaryPagination.limit,
                    callsWithSummaries.length - (currentPage - 1) * summaryPagination.limit
                );
                const indexInPage = prev % summaryPagination.limit;

                // Check if we're at the last item of current page
                if (indexInPage < itemsInCurrentPage - 1) {
                    return prev + 1;
                } else {
                    // Move to next page
                    if (currentPage < summaryPagination.totalPages) {
                        const nextPage = currentPage + 1;
                        setSummaryPagination(prevPagination => ({
                            ...prevPagination,
                            page: nextPage
                        }));
                        // Load next page if needed
                        loadSummaryPageIfNeeded(nextPage);
                        return currentPage * summaryPagination.limit;
                    }
                    return 0; // Wrap to first item
                }
            } else {
                return 0; // Wrap to first item
            }
        });
    };

    const handleGoToSummary = (index) => {
        setSummaryCarouselIndex(index);
        const page = Math.floor(index / summaryPagination.limit) + 1;
        setSummaryPagination(prev => ({ ...prev, page }));
        // Load page if needed
        loadSummaryPageIfNeeded(page);
    };

    const handleSummaryPageChange = (newPage) => {
        const newLimit = summaryPagination.limit;
        setSummaryPagination(prev => ({ ...prev, page: newPage }));
        // Set index to first item of the new page
        setSummaryCarouselIndex((newPage - 1) * newLimit);
        // Load page if needed
        loadSummaryPageIfNeeded(newPage);
    };

    // Get current page summaries - OPTIMIZED: Load page if needed
    const getCurrentPageSummaries = () => {
        const startIndex = (summaryPagination.page - 1) * summaryPagination.limit;
        const endIndex = startIndex + summaryPagination.limit;
        const pageSummaries = callsWithSummaries.slice(startIndex, endIndex);
        
        // Load page if we don't have data for current page
        if (pageSummaries.length === 0 || pageSummaries.every(s => !s || !s.summary)) {
            loadSummaryPageIfNeeded(summaryPagination.page);
        }
        
        return pageSummaries.filter(s => s && s.summary);
    };

    // Get current summary index within the current page
    const getCurrentPageIndex = () => {
        return summaryCarouselIndex % summaryPagination.limit;
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
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
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
                                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                                    Call Dashboard
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <DarkModeToggle />
                                <Button
                                    variant="outlined"
                                    startIcon={refreshing ? <CircularProgress size={16} /> : <Refresh />}
                                    onClick={fetchDashboardData}
                                    disabled={refreshing}
                                >
                                    Refresh
                                </Button>
                            </Box>
                        </Box>

                        {/* Statistics Cards - Enhanced UI */}
                        <Grid container spacing={3} sx={{ mb: 3 }}>
                            <Grid item xs={12} sm={6} md={4}>
                                <Card
                                    elevation={3}
                                    sx={{
                                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                        color: 'white',
                                        borderRadius: 3,
                                        transition: 'transform 0.2s, box-shadow 0.2s',
                                        '&:hover': {
                                            transform: 'translateY(-4px)',
                                            boxShadow: 6
                                        }
                                    }}
                                >
                                    <CardContent>
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <Box>
                                                <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5 }}>
                                                    {statistics?.total || 0}
                                                </Typography>
                                                <Typography variant="body2" sx={{ opacity: 0.9, fontSize: '0.875rem' }}>
                                                    Total Calls
                                                </Typography>
                                            </Box>
                                            <Box sx={{
                                                bgcolor: 'rgba(255,255,255,0.2)',
                                                borderRadius: '50%',
                                                p: 1.5,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                <Phone sx={{ fontSize: 40 }} />
                                            </Box>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>

                            <Grid item xs={12} sm={6} md={4}>
                                <Card
                                    elevation={3}
                                    sx={{
                                        background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                                        color: 'white',
                                        borderRadius: 3,
                                        transition: 'transform 0.2s, box-shadow 0.2s',
                                        '&:hover': {
                                            transform: 'translateY(-4px)',
                                            boxShadow: 6
                                        }
                                    }}
                                >
                                    <CardContent>
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <Box>
                                                <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5 }}>
                                                    {statistics?.completed || 0}
                                                </Typography>
                                                <Typography variant="body2" sx={{ opacity: 0.9, fontSize: '0.875rem' }}>
                                                    Completed
                                                </Typography>
                                            </Box>
                                            <Box sx={{
                                                bgcolor: 'rgba(255,255,255,0.2)',
                                                borderRadius: '50%',
                                                p: 1.5,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                <CheckCircle sx={{ fontSize: 40 }} />
                                            </Box>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>

                            <Grid item xs={12} sm={6} md={4}>
                                <Card
                                    elevation={3}
                                    sx={{
                                        background: 'linear-gradient(135deg, #3494E6 0%, #EC6EAD 100%)',
                                        color: 'white',
                                        borderRadius: 3,
                                        transition: 'transform 0.2s, box-shadow 0.2s',
                                        '&:hover': {
                                            transform: 'translateY(-4px)',
                                            boxShadow: 6
                                        }
                                    }}
                                >
                                    <CardContent>
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <Box>
                                                <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5 }}>
                                                    {activeCalls.length}
                                                </Typography>
                                                <Typography variant="body2" sx={{ opacity: 0.9, fontSize: '0.875rem' }}>
                                                    Active Calls
                                                </Typography>
                                            </Box>
                                            <Box sx={{
                                                bgcolor: 'rgba(255,255,255,0.2)',
                                                borderRadius: '50%',
                                                p: 1.5,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                <PhoneInTalk sx={{ fontSize: 40 }} />
                                            </Box>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>

                        </Grid>

{/* Call Summaries Carousel - OPTIMIZED: Lazy loading */}
<Card elevation={3} sx={{ mt: 3, mb: 3,borderRadius: 3, border: '1px solid', borderColor: 'primary.light', bgcolor: (theme) => theme.palette.mode === 'dark' ? 'background.paper' : 'background.default' }}>
                            <CardContent>
                                {/* Load all summaries button - fetches all pages to ensure no summaries are skipped */}
                                {callsWithSummaries.length === 0 && !loadingSummaries && (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                                        <Button
                                            variant="contained"
                                            color="primary"
                                            onClick={fetchAllSummaries}
                                            startIcon={<Description />}
                                            disabled={loadingSummaries}
                                        >
                                            {loadingSummaries ? 'Loading All Summaries...' : 'Load All Call Summaries'}
                                        </Button>
                                    </Box>
                                )}
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, flexWrap: 'wrap' }}>
                                            <Description color="primary" />
                                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                                Call Summaries
                                            </Typography>
                                            {/* Call Reason Chip in Title */}
                                            {currentSummaryEndedReason && (
                                                <Chip
                                                    label={currentSummaryEndedReason}
                                                    color={getEndedReasonColor(currentSummaryEndedReason)}
                                                    size="small"
                                                    sx={{ 
                                                        fontWeight: 700, 
                                                        fontSize: '0.75rem',
                                                        height: 28,
                                                        border: '2px solid',
                                                        borderColor: (theme) => {
                                                            const reason = currentSummaryEndedReason.toLowerCase();
                                                            if (reason.includes('error') || reason.includes('failed') || reason.includes('deleted')) {
                                                                return theme.palette.error.main;
                                                            } else if (reason.includes('busy') || reason.includes('customer-busy')) {
                                                                return theme.palette.warning.main;
                                                            } else if (reason.includes('did not answer') || reason.includes('no answer') || reason.includes('no-answer') || reason.includes('customer-did-not-answer')) {
                                                                return theme.palette.grey[400];
                                                            } else if (reason.includes('voicemail')) {
                                                                return theme.palette.info.main;
                                                            } else if (reason.includes('silence') || reason.includes('timeout') || reason.includes('timed out')) {
                                                                return theme.palette.warning.main;
                                                            } else if (reason.includes('customer ended') || reason.includes('customer-ended')) {
                                                                return theme.palette.error.main;
                                                            } else if (reason.includes('assistant ended') || reason.includes('assistant-ended') || reason.includes('call finished') || reason.includes('completed')) {
                                                                return theme.palette.success.main;
                                                            }
                                                            return theme.palette.grey[400];
                                                        },
                                                        '& .MuiChip-label': {
                                                            fontWeight: 800,
                                                            fontSize: '0.75rem',
                                                            px: 1.5
                                                        }
                                                    }}
                                                />
                                            )}
                                            {loadingSummaries ? (
                                                <CircularProgress size={16} sx={{ ml: 1 }} />
                                            ) : (
                                                <Chip
                                                    label={`${summaryCarouselIndex + 1} / ${callsWithSummaries.length} (Page ${summaryPagination.page}/${summaryPagination.totalPages})`}
                                                    color="primary"
                                                    size="small"
                                                    sx={{ fontWeight: 600, fontSize: '0.75rem', ml: 1 }}
                                                />
                                            )}
                                        </Box>
                                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                            {/* Page Navigation */}
                                            {summaryPagination.totalPages > 1 && (
                                                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', mr: 1 }}>
                                                    <Tooltip title="Previous Page">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleSummaryPageChange(Math.max(1, summaryPagination.page - 1))}
                                                            disabled={summaryPagination.page === 1 || loadingSummaries}
                                                        >
                                                            <ChevronLeft />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Typography variant="body2" sx={{ minWidth: 80, textAlign: 'center' }}>
                                                        Page {summaryPagination.page} / {summaryPagination.totalPages}
                                                    </Typography>
                                                    <Tooltip title="Next Page">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleSummaryPageChange(Math.min(summaryPagination.totalPages, summaryPagination.page + 1))}
                                                            disabled={summaryPagination.page >= summaryPagination.totalPages || loadingSummaries}
                                                        >
                                                            <ChevronRight />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Box>
                                            )}
                                            {/* Refresh All Summaries Button */}
                                            {callsWithSummaries.length > 0 && (
                                                <Tooltip title="Reload All Summaries">
                                                    <IconButton
                                                        size="small"
                                                        color="primary"
                                                        onClick={fetchAllSummaries}
                                                        disabled={loadingSummaries}
                                                    >
                                                        {loadingSummaries ? <CircularProgress size={16} /> : <Refresh />}
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                            {/* Item Navigation */}
                                            <Tooltip title="Previous Summary">
                                                <IconButton
                                                    size="small"
                                                    color="primary"
                                                    onClick={handlePreviousSummary}
                                                    disabled={callsWithSummaries.length === 0 || loadingSummaries}
                                                >
                                                    <NavigateBefore />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Next Summary">
                                                <IconButton
                                                    size="small"
                                                    color="primary"
                                                    onClick={handleNextSummary}
                                                    disabled={callsWithSummaries.length === 0 || loadingSummaries}
                                                >
                                                    <NavigateNext />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </Box>
                                    {/* Ended Reason Display - Big Title */}
                                    {currentSummaryEndedReason && (
                                        <Box sx={{ 
                                            display: 'flex', 
                                            margin: 'auto',
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            py: 2,
                                            px: 3,
                                            borderRadius: 2,
                                            bgcolor: (theme) => {
                                                const reason = currentSummaryEndedReason.toLowerCase();
                                                if (reason.includes('error') || reason.includes('failed') || reason.includes('deleted')) {
                                                    return theme.palette.mode === 'dark' ? 'error.dark' : 'error.light';
                                                } else if (reason.includes('busy') || reason.includes('customer-busy')) {
                                                    return theme.palette.mode === 'dark' ? 'warning.dark' : 'warning.light';
                                                } else if (reason.includes('did not answer') || reason.includes('no answer') || reason.includes('no-answer') || reason.includes("did-not-answer")) {
                                                    return theme.palette.mode === 'dark' ? 'grey.800' : 'grey.200';
                                                } else if (reason.includes('voicemail')) {
                                                    return theme.palette.mode === 'dark' ? 'info.dark' : 'info.light';
                                                } else if (reason.includes('silence') || reason.includes('timeout') || reason.includes('timed out')) {
                                                    return theme.palette.mode === 'dark' ? 'warning.dark' : 'warning.light';
                                                } else if (reason.includes('customer ended') || reason.includes('customer-ended') || reason.includes("ended the call")) {
                                                    return theme.palette.mode === 'dark' ? 'success.dark' : 'success.light';
                                                } else if (reason.includes('assistant ended') || reason.includes('assistant-ended') || reason.includes('call finished') || reason.includes('completed')) {
                                                    return theme.palette.mode === 'dark' ? 'success.dark' : 'success.light';
                                                }
                                                return theme.palette.mode === 'dark' ? 'grey.800' : 'grey.200';
                                            },
                                            border: '2px solid',
                                            borderColor: (theme) => {
                                                const reason = currentSummaryEndedReason.toLowerCase();
                                                if (reason.includes('error') || reason.includes('failed') || reason.includes('deleted')) {
                                                    return 'error.main';
                                                } else if (reason.includes('busy') || reason.includes('customer-busy')) {
                                                    return 'warning.main';
                                                } else if (reason.includes('did not answer') || reason.includes('no answer') || reason.includes('no-answer') || reason.includes("did-not-answer")) {
                                                    return 'grey.400';
                                                } else if (reason.includes('voicemail')) {
                                                    return 'info.main';
                                                } else if (reason.includes('silence') || reason.includes('timeout') || reason.includes('timed out')) {
                                                    return 'warning.main';
                                                } else if (reason.includes('customer ended') || reason.includes('customer-ended') || reason.includes("ended the call")) {
                                                    return 'success.main';
                                                } else if (reason.includes('assistant ended') || reason.includes('assistant-ended') || reason.includes('call finished') || reason.includes('completed')) {
                                                    return 'success.main';
                                                }
                                                return 'grey.400';
                                            },
                                            boxShadow: 3
                                        }}>
                                            <Typography 
                                                variant="h4" 
                                                sx={{ 
                                                    fontWeight: 800,
                                                    fontSize: { xs: '1rem', md: '1rem' },
                                                    textTransform: 'uppercase',
                                                    letterSpacing: 1,
                                                    color: (theme) => {
                                                        const reason = currentSummaryEndedReason.toLowerCase();
                                                        if (reason.includes('error') || reason.includes('failed') || reason.includes('deleted')) {
                                                            return 'error.main';
                                                        } else if (reason.includes('busy') || reason.includes('customer-busy')) {
                                                            return 'warning.main';
                                                        } else if (reason.includes('did not answer') || reason.includes('no answer') || reason.includes('no-answer') || reason.includes("did-not-answer")) {
                                                            return 'text.primary';
                                                        } else if (reason.includes('voicemail')) {
                                                            return 'info.main';
                                                        } else if (reason.includes('silence') || reason.includes('timeout') || reason.includes('timed out')) {
                                                            return 'warning.main';
                                                        } else if (reason.includes('customer ended') || reason.includes('customer-ended') || reason.includes("ended the call")) {
                                                            return 'success.main';
                                                        } else if (reason.includes('assistant ended') || reason.includes('assistant-ended') || reason.includes('call finished') || reason.includes('completed')) {
                                                            return 'success.main';
                                                        }
                                                        return 'text.primary';
                                                    }
                                                }}
                                            >
                                            {currentSummaryEndedReason}
                                            </Typography>
                                        </Box>
                                    )}
                                </Box>

                                {loadingSummaries ? (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
                                        <CircularProgress />
                                        <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                                            Loading summaries...
                                        </Typography>
                                    </Box>
                                ) : callsWithSummaries.length === 0 && !loadingSummaries ? (
                                    <Box sx={{ textAlign: 'center', py: 4 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            No call summaries loaded. Click "Load Call Summaries" above to load them.
                                        </Typography>
                                    </Box>
                                ) : callsWithSummaries[summaryCarouselIndex] && callsWithSummaries[summaryCarouselIndex].summary ? (
                                    <Box>
                                        {/* Lead & Call Info */}
                                        <Grid container spacing={2} sx={{ mb: 2 }}>
                                            <Grid item xs={12} md={6}>
                                                <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                                                    <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ fontWeight: 600 }}>
                                                        Lead Information
                                                    </Typography>
                                                    {callsWithSummaries[summaryCarouselIndex].leadId ? (
                                                        <Box>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                                                <Avatar sx={{ width: 32, height: 32, fontSize: '0.75rem', bgcolor: 'primary.main' }}>
                                                                    {typeof callsWithSummaries[summaryCarouselIndex].leadId === 'object'
                                                                        ? `${callsWithSummaries[summaryCarouselIndex].leadId.firstName?.[0] || ''}${callsWithSummaries[summaryCarouselIndex].leadId.lastName?.[0] || ''}`
                                                                        : 'L'}
                                                                </Avatar>
                                                                <Box>
                                                                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                                                        {typeof callsWithSummaries[summaryCarouselIndex].leadId === 'object'
                                                                            ? `${callsWithSummaries[summaryCarouselIndex].leadId.firstName || ''} ${callsWithSummaries[summaryCarouselIndex].leadId.lastName || ''}`.trim()
                                                                            : 'Unknown Lead'}
                                                                    </Typography>
                                                                    {typeof callsWithSummaries[summaryCarouselIndex].leadId === 'object' && callsWithSummaries[summaryCarouselIndex].leadId.email && (
                                                                        <Typography variant="caption" color="text.secondary">
                                                                            {callsWithSummaries[summaryCarouselIndex].leadId.email}
                                                                        </Typography>
                                                                    )}
                                                                </Box>
                                                            </Box>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                                                                <Phone sx={{ fontSize: 14, color: 'text.secondary' }} />
                                                                <Typography variant="body2" color="text.secondary">
                                                                    {callsWithSummaries[summaryCarouselIndex].phoneNumber}
                                                                </Typography>
                                                            </Box>
                                                        </Box>
                                                    ) : (
                                                        <Typography variant="body2" color="text.secondary">
                                                            No lead information available
                                                        </Typography>
                                                    )}
                                                </Box>
                                            </Grid>
                                            <Grid item xs={12} md={6}>
                                                <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                                                    <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ fontWeight: 600 }}>
                                                        Call Details
                                                    </Typography>
                                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                        {currentSummaryEndedReason && (
                                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                                                <Typography variant="body2" color="text.secondary">Ended Reason:</Typography>
                                                                <Chip
                                                                    label={currentSummaryEndedReason}
                                                                    color={getEndedReasonColor(currentSummaryEndedReason)}
                                                                    size="small"
                                                                    sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                                                                />
                                                            </Box>
                                                        )}
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <Typography variant="body2" color="text.secondary">Duration:</Typography>
                                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                {formatDuration(currentSummaryDuration)}
                                                            </Typography>
                                                        </Box>
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <Typography variant="body2" color="text.secondary">Completed:</Typography>
                                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                {formatDateTime(currentSummaryEndedAt)}
                                                            </Typography>
                                                        </Box>
                                                        {currentSummaryStartedAt && (
                                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <Typography variant="body2" color="text.secondary">Started:</Typography>
                                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                    {formatDateTime(currentSummaryStartedAt)}
                                                                </Typography>
                                                            </Box>
                                                        )}
                                                    </Box>
                                                </Box>
                                            </Grid>
                                        </Grid>

                                        {/* Summary/Transcript Content with Toggle */}
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            {/* Toggle Buttons */}
                                            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                                                <Button
                                                    variant={activeContentView === 'summary' ? 'contained' : 'outlined'}
                                                    color={activeContentView === 'summary' ? 'primary' : 'default'}
                                                    onClick={() => setActiveContentView('summary')}
                                                    sx={{ 
                                                        fontWeight: 600,
                                                        textTransform: 'none',
                                                        minWidth: 150
                                                    }}
                                                >
                                                    Call Summary
                                                </Button>
                                                <Tooltip title={hasTranscript ? "View Call Transcript" : "No transcript for this call"}>
                                                    <span>
                                                        <Button
                                                            variant={activeContentView === 'transcript' ? 'contained' : 'outlined'}
                                                            color={activeContentView === 'transcript' ? 'secondary' : 'default'}
                                                            onClick={() => setActiveContentView('transcript')}
                                                            disabled={!hasTranscript}
                                                            sx={{ 
                                                                fontWeight: 600,
                                                                textTransform: 'none',
                                                                minWidth: 150
                                                            }}
                                                        >
                                                            Call Transcript
                                                        </Button>
                                                    </span>
                                                </Tooltip>
                                            </Box>

                                            {/* Conditional Content Display */}
                                            {activeContentView === 'summary' ? (
                                                <Box sx={{ p: 3, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider', minHeight: 200, maxHeight: 400, overflow: 'auto' }}>
                                                    {/* Structured Outputs - MOST IMPORTANT DATA - Display First */}
                                                    {currentSummaryStructuredOutputs.length > 0 && (
                                                        <Box sx={{ mb: 3, pb: 3, borderBottom: '2px solid', borderColor: 'divider' }}>
                                                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: 'primary.main', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                <CheckCircle sx={{ fontSize: 24 }} />
                                                                Structured Outputs
                                                            </Typography>
                                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                                                {currentSummaryStructuredOutputs.map((output, idx) => (
                                                                    <Box
                                                                        key={output.id || idx}
                                                                        sx={{
                                                                            p: 2,
                                                                            borderRadius: 2,
                                                                            bgcolor: typeof output.result === 'boolean' 
                                                                                ? (output.result ? 'success.light' : 'error.light')
                                                                                : 'background.default',
                                                                            border: '2px solid',
                                                                            borderColor: typeof output.result === 'boolean'
                                                                                ? (output.result ? 'success.main' : 'error.main')
                                                                                : 'divider',
                                                                            boxShadow: 2
                                                                        }}
                                                                    >
                                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                                                                            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                                                {output.name || 'Structured Output'}
                                                                            </Typography>
                                                                            {typeof output.result === 'boolean' ? (
                                                                                <Chip
                                                                                    label={output.result ? 'Yes' : 'No'}
                                                                                    color={output.result ? 'success' : 'error'}
                                                                                    sx={{
                                                                                        fontWeight: 800,
                                                                                        fontSize: '0.875rem',
                                                                                        height: 32,
                                                                                        px: 1,
                                                                                        '& .MuiChip-label': {
                                                                                            px: 2
                                                                                        }
                                                                                    }}
                                                                                />
                                                                            ) : (
                                                                                <Chip
                                                                                    label={String(output.result)}
                                                                                    color="default"
                                                                                    sx={{
                                                                                        fontWeight: 700,
                                                                                        fontSize: '0.875rem',
                                                                                        height: 32
                                                                                    }}
                                                                                />
                                                                            )}
                                                                        </Box>
                                                                    </Box>
                                                                ))}
                                                            </Box>
                                                        </Box>
                                                    )}
                                                    
                                                    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2, color: 'primary.main' }}>
                                                        Call Summary
                                                    </Typography>
                                                    <Typography
                                                        variant="body1"
                                                        sx={{
                                                            whiteSpace: 'pre-wrap',
                                                            lineHeight: 1.8,
                                                            color: 'text.primary'
                                                        }}
                                                    >
                                                        {callsWithSummaries[summaryCarouselIndex].summary}
                                                    </Typography>
                                                </Box>
                                            ) : activeContentView === 'transcript' && callsWithSummaries[summaryCarouselIndex].transcript ? (
                                                <Box sx={{ p: 3, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider', minHeight: 200, maxHeight: 400, overflow: 'auto' }}>
                                                    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2, color: 'secondary.main' }}>
                                                        Call Transcript
                                                    </Typography>
                                                    {typeof callsWithSummaries[summaryCarouselIndex].transcript === 'string' ? (
                                                        <Box sx={{ 
                                                            p: 2, 
                                                            bgcolor: 'background.default', 
                                                            borderRadius: 1,
                                                            border: '1px solid',
                                                            borderColor: 'divider'
                                                        }}>
                                                            {callsWithSummaries[summaryCarouselIndex].transcript.split('\n').map((line, idx) => {
                                                                // Try to identify speaker (bot/human) from transcript format
                                                                const isBot = line.toLowerCase().includes('assistant') || 
                                                                             line.toLowerCase().includes('helen') ||
                                                                             line.toLowerCase().includes('bot') ||
                                                                             (line.match(/^[A-Z][^:]+:/) && !line.toLowerCase().includes('user') && !line.toLowerCase().includes('customer'));
                                                                const isUser = line.toLowerCase().includes('user') || 
                                                                              line.toLowerCase().includes('customer') ||
                                                                              line.toLowerCase().includes('caller');
                                                                
                                                                return (
                                                                    <Box 
                                                                        key={idx} 
                                                                        sx={{ 
                                                                            mb: 1.5,
                                                                            p: 1.5,
                                                                            borderRadius: 1,
                                                                            bgcolor: isBot ? 'primary.light' : isUser ? 'success.light' : 'background.paper',
                                                                            borderLeft: '4px solid',
                                                                            borderColor: isBot ? 'primary.main' : isUser ? 'success.main' : 'divider'
                                                                        }}
                                                                    >
                                                                        <Typography 
                                                                            variant="body2" 
                                                                            sx={{ 
                                                                                whiteSpace: 'pre-wrap',
                                                                                lineHeight: 1.8,
                                                                                color: 'text.primary',
                                                                                fontStyle: line.trim() ? 'normal' : 'italic'
                                                                            }}
                                                                        >
                                                                            {line.trim() || '\u00A0'}
                                                                        </Typography>
                                                                    </Box>
                                                                );
                                                            })}
                                                        </Box>
                                                    ) : callsWithSummaries[summaryCarouselIndex].transcript.messages ? (
                                                        <Box sx={{ 
                                                            p: 2, 
                                                            bgcolor: 'background.default', 
                                                            borderRadius: 1,
                                                            border: '1px solid',
                                                            borderColor: 'divider'
                                                        }}>
                                                            {callsWithSummaries[summaryCarouselIndex].transcript.messages.map((msg, idx) => {
                                                                const isBot = msg.role === 'assistant' || msg.role === 'system';
                                                                const isUser = msg.role === 'user';
                                                                const content = msg.content || msg.text || msg.message || '';
                                                                
                                                                return (
                                                                    <Box 
                                                                        key={idx} 
                                                                        sx={{ 
                                                                            mb: 1.5,
                                                                            p: 1.5,
                                                                            borderRadius: 1,
                                                                            bgcolor: isBot ? 'primary.light' : isUser ? 'success.light' : 'background.paper',
                                                                            borderLeft: '4px solid',
                                                                            borderColor: isBot ? 'primary.main' : isUser ? 'success.main' : 'divider'
                                                                        }}
                                                                    >
                                                                        <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5, textTransform: 'uppercase' }}>
                                                                            {isBot ? '🤖 Assistant' : isUser ? '👤 User' : msg.role || 'Unknown'}
                                                                        </Typography>
                                                                        <Typography 
                                                                            variant="body2" 
                                                                            sx={{ 
                                                                                whiteSpace: 'pre-wrap',
                                                                                lineHeight: 1.8,
                                                                                color: 'text.primary'
                                                                            }}
                                                                        >
                                                                            {content}
                                                                        </Typography>
                                                                    </Box>
                                                                );
                                                            })}
                                                        </Box>
                                                    ) : (
                                                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                            Transcript format not recognized
                                                        </Typography>
                                                    )}
                                                </Box>
                                            ) : activeContentView === 'transcript' ? (
                                                <Box sx={{ p: 3, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Typography variant="body1" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                        No transcript available for this call
                                                    </Typography>
                                                </Box>
                                            ) : (
                                                <Box sx={{ p: 3, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Typography variant="body1" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                        No content available
                                                    </Typography>
                                                </Box>
                                            )}
                                        </Box>

                                        {/* Summary Navigation Dots - Show dots for current page only */}
                                        {getCurrentPageSummaries().length > 1 && (
                                            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                                                {getCurrentPageSummaries().map((_, index) => {
                                                    const globalIndex = (summaryPagination.page - 1) * summaryPagination.limit + index;
                                                    return (
                                                        <Box
                                                            key={globalIndex}
                                                            onClick={() => handleGoToSummary(globalIndex)}
                                                            sx={{
                                                                width: 8,
                                                                height: 8,
                                                                borderRadius: '50%',
                                                                bgcolor: (theme) => globalIndex === summaryCarouselIndex 
                                                                    ? 'primary.main' 
                                                                    : (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'grey.300'),
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s',
                                                                '&:hover': {
                                                                    bgcolor: (theme) => globalIndex === summaryCarouselIndex 
                                                                        ? 'primary.dark' 
                                                                        : (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'grey.400'),
                                                                    transform: 'scale(1.2)'
                                                                }
                                                            }}
                                                        />
                                                    );
                                                })}
                                                {summaryPagination.totalPages > 1 && (
                                                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                                        Page {summaryPagination.page} of {summaryPagination.totalPages} ({summaryPagination.total} total)
                                                    </Typography>
                                                )}
                                            </Box>
                                        )}

                                        {/* Quick Actions */}
                                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                startIcon={<Visibility />}
                                                onClick={() => handleViewCallDetails(callsWithSummaries[summaryCarouselIndex])}
                                            >
                                                View Full Details
                                            </Button>
                                            {callsWithSummaries[summaryCarouselIndex].leadId && (
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    startIcon={<History />}
                                                    onClick={() => handleViewCallHistory(
                                                        typeof callsWithSummaries[summaryCarouselIndex].leadId === 'object'
                                                            ? (callsWithSummaries[summaryCarouselIndex].leadId._id || callsWithSummaries[summaryCarouselIndex].leadId)
                                                            : callsWithSummaries[summaryCarouselIndex].leadId
                                                    )}
                                                >
                                                    View History
                                                </Button>
                                            )}
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                color="error"
                                                startIcon={<DeleteIcon />}
                                                onClick={() => {
                                                    const callId = callsWithSummaries[summaryCarouselIndex]._id;
                                                    setDeleteCallConfirm(callId);
                                                    setDeleteLeadCheckbox(false);
                                                }}
                                            >
                                                Delete
                                            </Button>
                                        </Box>
                                    </Box>
                                ) : (
                                    <Box sx={{ textAlign: 'center', py: 4 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            No summary available for this call.
                                        </Typography>
                                    </Box>
                                )}
                            </CardContent>
                        </Card>
                        {/* Success Rate & Queue Status */}
                        <Grid container spacing={3} sx={{ mb: 3 }}>
                            <Grid item xs={12} md={6}>
                                <Card elevation={3} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                                    <CardContent>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                            <TrendingUp color="success" />
                                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                                Success Rate
                                            </Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                                            <Box sx={{ flex: 1 }}>
                                                <LinearProgress
                                                    variant="determinate"
                                                    value={parseFloat(statistics?.successRate || 0)}
                                                    sx={{
                                                        height: 24,
                                                        borderRadius: 3,
                                                        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'grey.200',
                                                        '& .MuiLinearProgress-bar': {
                                                            borderRadius: 3,
                                                            background: 'linear-gradient(90deg, #11998e 0%, #38ef7d 100%)',
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                                        }
                                                    }}
                                                />
                                            </Box>
                                            <Typography variant="h4" sx={{ fontWeight: 700, color: 'success.main', minWidth: 90, textAlign: 'right' }}>
                                                {statistics?.successRate || 0}%
                                            </Typography>
                                        </Box>
                                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, display: 'block', fontSize: '0.875rem' }}>
                                            {statistics?.completed || 0} completed out of {statistics?.total || 0} total calls
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>

                            <Grid item xs={12} md={6}>
                                <Card elevation={3} sx={{ height: '100%', borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                                    <CardContent>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                                Call Queue Status
                                            </Typography>
                                            <Stack direction="row" spacing={1}>
                                                {(queueStatus?.pending > 0 || queueStatus?.isProcessing) && (
                                                    <>
                                                        {queueStatus?.isPaused ? (
                                                            <Button
                                                                variant="contained"
                                                                color="success"
                                                                size="small"
                                                                startIcon={<PlayArrow />}
                                                                onClick={handleResumeQueue}
                                                                disabled={pausing}
                                                            >
                                                                Resume
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                variant="contained"
                                                                color="warning"
                                                                size="small"
                                                                startIcon={<Pause />}
                                                                onClick={handlePauseQueue}
                                                                disabled={pausing}
                                                            >
                                                                Pause
                                                            </Button>
                                                        )}
                                                    </>
                                                )}
                                                {queueStatus?.totalScheduled > 0 && (
                                                    <Tooltip title={`Delete all ${queueStatus.totalScheduled.toLocaleString()} scheduled calls`}>
                                                        <Button
                                                            variant="outlined"
                                                            color="error"
                                                            size="small"
                                                            startIcon={deletingByStatus === 'scheduled' ? <CircularProgress size={16} /> : <DeleteIcon />}
                                                            onClick={handleDeleteAllScheduledCalls}
                                                            disabled={deletingByStatus === 'scheduled'}
                                                        >
                                                            {deletingByStatus === 'scheduled' ? 'Deleting...' : 'Clear All Scheduled'}
                                                        </Button>
                                                    </Tooltip>
                                                )}
                                            </Stack>
                                        </Box>
                                        <Stack spacing={2}>
                                            
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    Total Scheduled
                                                </Typography>
                                                <Chip
                                                    label={queueStatus?.totalScheduled || 0}
                                                    color="info"
                                                    sx={{ fontWeight: 600 }}
                                                />
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    Currently Processing
                                                </Typography>
                                                <Chip
                                                    label={queueStatus?.isProcessing ? 'Yes' : 'No'}
                                                    color={queueStatus?.isProcessing ? 'info' : 'default'}
                                                    sx={{ fontWeight: 600 }}
                                                />
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    Queue Status
                                                </Typography>
                                                <Chip
                                                    label={queueStatus?.isPaused ? 'Paused' : 'Running'}
                                                    color={queueStatus?.isPaused ? 'warning' : 'success'}
                                                    sx={{ fontWeight: 600 }}
                                                />
                                            </Box>
                                            {queueStatus?.currentCall && (
                                                <Box sx={{ p: 2, bgcolor: 'info.light', borderRadius: 1, border: '1px solid', borderColor: 'info.main' }}>
                                                    <Typography variant="caption" color="text.secondary" display="block" gutterBottom sx={{ fontWeight: 600 }}>
                                                        Current Call in Queue
                                                    </Typography>
                                                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                                        {queueStatus.currentCall.phoneNumber}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        Status: {queueStatus.currentCall.status}
                                                    </Typography>
                                                </Box>
                                            )}
                                            {queueStatus?.activeCall && (
                                                <Box sx={{ p: 2, bgcolor: 'success.light', borderRadius: 1, border: '1px solid', borderColor: 'success.main' }}>
                                                    <Typography variant="caption" color="text.secondary" display="block" gutterBottom sx={{ fontWeight: 600 }}>
                                                        Active Call
                                                    </Typography>
                                                    {queueStatus.activeCall.leadInfo && (
                                                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                                            {queueStatus.activeCall.leadInfo.firstName} {queueStatus.activeCall.leadInfo.lastName}
                                                        </Typography>
                                                    )}
                                                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                                        {queueStatus.activeCall.phoneNumber}
                                                    </Typography>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                                                        <Typography variant="caption" color="text.secondary">
                                                            Duration: {formatDuration(queueStatus.activeCall.duration || 0)}
                                                        </Typography>
                                                        <Chip
                                                            label={queueStatus.activeCall.status?.replace('-', ' ').toUpperCase()}
                                                            size="small"
                                                            color="success"
                                                            sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                                                        />
                                                    </Box>
                                                </Box>
                                            )}
                                        </Stack>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>

                        {/* Active Calls Table */}
                        <Card elevation={3} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                            <CardContent>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <PhoneInTalk color="info" />
                                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                            Active Calls
                                        </Typography>
                                    </Box>
                                    <Chip
                                        label={`${activeCalls.length} Active`}
                                        color="info"
                                        sx={{ fontWeight: 600, fontSize: '0.875rem', height: 28 }}
                                    />
                                </Box>

                                {activeCalls.length === 0 ? (
                                    <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
                                        <PhoneDisabled sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                                        <Typography variant="h6" color="text.secondary" gutterBottom>
                                            No Active Calls
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            All calls are completed or no calls are in progress
                                        </Typography>
                                    </Paper>
                                ) : (
                                    <TableContainer>
                                        <Table>
                                            <TableHead>
                                                <TableRow sx={{ bgcolor: 'background.default' }}>
                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Lead</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Phone</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Status</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Duration</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Started</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Actions</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {activeCalls.map((call) => (
                                                    <TableRow key={call._id || call.sessionId} hover>
                                                        <TableCell>
                                                            {call.leadId ? (
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                    <Avatar sx={{ width: 32, height: 32, fontSize: '0.75rem' }}>
                                                                        {call.leadId.firstName?.[0]}{call.leadId.lastName?.[0]}
                                                                    </Avatar>
                                                                    <Box>
                                                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                            {call.leadId.firstName} {call.leadId.lastName}
                                                                        </Typography>
                                                                        <Typography variant="caption" color="text.secondary">
                                                                            {call.leadId.email}
                                                                        </Typography>
                                                                    </Box>
                                                                </Box>
                                                            ) : (
                                                                <Typography variant="body2" color="text.secondary">
                                                                    Unknown Lead
                                                                </Typography>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                <Phone sx={{ fontSize: 16, color: 'text.secondary' }} />
                                                                <Typography variant="body2">
                                                                    {call.phoneNumber}
                                                                </Typography>
                                                            </Box>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Chip
                                                                label={call.status?.replace('-', ' ').toUpperCase() || 'UNKNOWN'}
                                                                size="small"
                                                                color={
                                                                    call.status === 'completed' ? 'success' :
                                                                        call.status === 'in-progress' ? 'info' :
                                                                            call.status === 'ringing' ? 'warning' :
                                                                                call.status === 'failed' ? 'error' :
                                                                                    call.status === 'no-answer' ? 'warning' :
                                                                                        call.status === 'cancelled' ? 'default' : 'default'
                                                                }
                                                                icon={
                                                                    call.status === 'in-progress' ? <PhoneInTalk /> :
                                                                        call.status === 'ringing' ? <PhoneCallback /> :
                                                                            <Phone />
                                                                }
                                                                sx={{ fontWeight: 600, textTransform: 'capitalize' }}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                <Timer sx={{ fontSize: 16, color: 'text.secondary' }} />
                                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                    {call.liveDurationFormatted || formatDuration(call.liveDuration || call.duration || 0)}
                                                                </Typography>
                                                            </Box>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Typography variant="body2" color="text.secondary">
                                                                {formatDateTime(call.startedAt)}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Tooltip title="Cancel Call">
                                                                <IconButton
                                                                    size="small"
                                                                    color="error"
                                                                    onClick={() => handleCancelCall(call.sessionId)}
                                                                >
                                                                    <Stop />
                                                                </IconButton>
                                                            </Tooltip>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                )}
                            </CardContent>
                        </Card>

                        {/* Completed Calls with Pagination and Filters */}
                        <Card elevation={3} sx={{ mt: 3, borderRadius: 3, border: '2px solid', borderColor: 'success.light', bgcolor: 'success.50' }}>
                            <CardContent>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <CheckCircle color="success" />
                                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                            Call History
                                            {completedCallsPagination.total > 0 && (
                                                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1, fontWeight: 400 }}>
                                                    ({completedCallsPagination.total} total)
                                                </Typography>
                                            )}
                                        </Typography>
                                    </Box>

                                    {/* Filters */}
                                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <FormControl size="small" sx={{ minWidth: 120 }}>
                                            <InputLabel>Status</InputLabel>
                                            <Select
                                                value={callFilters.status}
                                                label="Status"
                                                onChange={(e) => {
                                                    setCallFilters(prev => ({ ...prev, status: e.target.value }));
                                                    setCompletedCallsPagination(prev => ({ ...prev, page: 1 }));
                                                    setSelectedCalls([]); // Clear selection when filter changes
                                                }}
                                            >
                                                <MenuItem value="completed">Completed</MenuItem>
                                                <MenuItem value="failed">Failed</MenuItem>
                                                <MenuItem value="cancelled">Cancelled</MenuItem>
                                                <MenuItem value="retry">Retry Calls</MenuItem>
                                                <MenuItem value="all">All</MenuItem>
                                            </Select>
                                        </FormControl>

                                        <TextField
                                            size="small"
                                            placeholder="Search phone/lead..."
                                            value={callFilters.search}
                                            onChange={(e) => {
                                                setCallFilters(prev => ({ ...prev, search: e.target.value }));
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

                                        <FormControl size="small" sx={{ minWidth: 120 }}>
                                            <InputLabel>Date Range</InputLabel>
                                            <Select
                                                value={callFilters.dateRange}
                                                label="Date Range"
                                                onChange={(e) => {
                                                    setCallFilters(prev => ({ ...prev, dateRange: e.target.value }));
                                                    setCompletedCallsPagination(prev => ({ ...prev, page: 1 }));
                                                    setSelectedCalls([]); // Clear selection when filter changes
                                                }}
                                            >
                                                <MenuItem value="">All Time</MenuItem>
                                                <MenuItem value="today">Today</MenuItem>
                                                <MenuItem value="week">This Week</MenuItem>
                                                <MenuItem value="month">This Month</MenuItem>
                                            </Select>
                                        </FormControl>

                                        {(callFilters.status === 'failed' || callFilters.status === 'cancelled' || callFilters.status === 'retry' || callFilters.status === 'completed') && (
                                            <Tooltip title={`Delete all ${callFilters.status === 'retry' ? 'retry' : callFilters.status} calls`}>
                                                <Button
                                                    variant="outlined"
                                                    size="small"
                                                    color="error"
                                                    startIcon={deletingByStatus === callFilters.status ? <CircularProgress size={16} /> : <DeleteIcon />}
                                                    onClick={() => handleDeleteCallsByStatus(callFilters.status)}
                                                    disabled={deletingByStatus === callFilters.status}
                                                    sx={{ minWidth: 140 }}
                                                >
                                                    {deletingByStatus === callFilters.status ? 'Deleting...' : `Delete All ${callFilters.status === 'retry' ? 'Retry' : callFilters.status.charAt(0).toUpperCase() + callFilters.status.slice(1)}`}
                                                </Button>
                                            </Tooltip>
                                        )}

                                        {selectedCalls.length > 0 && (
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
                                                sx={{ minWidth: 140 }}
                                            >
                                                {deletingBulk ? 'Deleting...' : `Delete Selected (${selectedCalls.length})`}
                                            </Button>
                                        )}

                                        <Button
                                            variant="outlined"
                                            size="small"
                                            startIcon={<Download />}
                                            onClick={handleExportCalls}
                                            sx={{ minWidth: 100 }}
                                        >
                                            Export CSV
                                        </Button>

                                        <IconButton
                                            size="small"
                                            color="primary"
                                            onClick={() => {
                                                setCallFilters({ status: 'completed', search: '', dateRange: '', sortBy: 'endedAt', sortOrder: 'desc' });
                                                setCompletedCallsPagination(prev => ({ ...prev, page: 1 }));
                                                setSelectedCalls([]); // Clear selection when filters are cleared
                                            }}
                                            title="Clear Filters"
                                        >
                                            <Refresh />
                                        </IconButton>
                                    </Box>
                                </Box>

                                {completedCalls.length === 0 ? (
                                    <Box sx={{ textAlign: 'center', py: 4 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            No calls found. Try adjusting your filters.
                                        </Typography>
                                    </Box>
                                ) : (
                                    <>
                                        <TableContainer>
                                            <Table size="small">
                                                <TableHead>
                                                    <TableRow sx={{ bgcolor: 'success.50' }}>
                                                        <TableCell padding="checkbox" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                                                            <Checkbox
                                                                indeterminate={selectedCalls.length > 0 && selectedCalls.length < completedCalls.filter(call => {
                                                                    if (callFilters.search) {
                                                                        const searchLower = callFilters.search.toLowerCase();
                                                                        const phoneMatch = call.phoneNumber?.toLowerCase().includes(searchLower);
                                                                        const leadMatch = typeof call.leadId === 'object' && (
                                                                            call.leadId.firstName?.toLowerCase().includes(searchLower) ||
                                                                            call.leadId.lastName?.toLowerCase().includes(searchLower) ||
                                                                            call.leadId.email?.toLowerCase().includes(searchLower)
                                                                        );
                                                                        if (!phoneMatch && !leadMatch) return false;
                                                                    }
                                                                    if (callFilters.dateRange && call.endedAt) {
                                                                        const callDate = new Date(call.endedAt);
                                                                        const now = new Date();
                                                                        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                                                                        if (callFilters.dateRange === 'today' && callDate < todayStart) return false;
                                                                        if (callFilters.dateRange === 'week') {
                                                                            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                                                                            if (callDate < weekAgo) return false;
                                                                        }
                                                                        if (callFilters.dateRange === 'month') {
                                                                            const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                                                                            if (callDate < monthAgo) return false;
                                                                        }
                                                                    }
                                                                    return true;
                                                                }).length}
                                                                checked={completedCalls.length > 0 && completedCalls.filter(call => {
                                                                    if (callFilters.search) {
                                                                        const searchLower = callFilters.search.toLowerCase();
                                                                        const phoneMatch = call.phoneNumber?.toLowerCase().includes(searchLower);
                                                                        const leadMatch = typeof call.leadId === 'object' && (
                                                                            call.leadId.firstName?.toLowerCase().includes(searchLower) ||
                                                                            call.leadId.lastName?.toLowerCase().includes(searchLower) ||
                                                                            call.leadId.email?.toLowerCase().includes(searchLower)
                                                                        );
                                                                        if (!phoneMatch && !leadMatch) return false;
                                                                    }
                                                                    if (callFilters.dateRange && call.endedAt) {
                                                                        const callDate = new Date(call.endedAt);
                                                                        const now = new Date();
                                                                        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                                                                        if (callFilters.dateRange === 'today' && callDate < todayStart) return false;
                                                                        if (callFilters.dateRange === 'week') {
                                                                            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                                                                            if (callDate < weekAgo) return false;
                                                                        }
                                                                        if (callFilters.dateRange === 'month') {
                                                                            const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                                                                            if (callDate < monthAgo) return false;
                                                                        }
                                                                    }
                                                                    return true;
                                                                }).every(call => selectedCalls.includes(call._id))}
                                                                onChange={(e) => handleSelectAll(e.target.checked)}
                                                            />
                                                        </TableCell>
                                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Lead</TableCell>
                                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Phone</TableCell>
                                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Status</TableCell>
                                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Ended Reason</TableCell>
                                                        <TableCell
                                                            sx={{ fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', userSelect: 'none' }}
                                                            onClick={() => handleSort('duration')}
                                                        >
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                Duration
                                                                {getSortIcon('duration')}
                                                            </Box>
                                                        </TableCell>
                                                        <TableCell
                                                            sx={{ fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', userSelect: 'none' }}
                                                            onClick={() => handleSort('endedAt')}
                                                        >
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                Completed At
                                                                {getSortIcon('endedAt')}
                                                            </Box>
                                                        </TableCell>
                                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Actions</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {completedCalls
                                                        .filter(call => {
                                                            // Apply search filter
                                                            if (callFilters.search) {
                                                                const searchLower = callFilters.search.toLowerCase();
                                                                const phoneMatch = call.phoneNumber?.toLowerCase().includes(searchLower);
                                                                const leadMatch = typeof call.leadId === 'object' && (
                                                                    call.leadId.firstName?.toLowerCase().includes(searchLower) ||
                                                                    call.leadId.lastName?.toLowerCase().includes(searchLower) ||
                                                                    call.leadId.email?.toLowerCase().includes(searchLower)
                                                                );
                                                                if (!phoneMatch && !leadMatch) return false;
                                                            }

                                                            // Apply date range filter
                                                            if (callFilters.dateRange && call.endedAt) {
                                                                const callDate = new Date(call.endedAt);
                                                                const now = new Date();
                                                                const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                                                                if (callFilters.dateRange === 'today' && callDate < todayStart) return false;
                                                                if (callFilters.dateRange === 'week') {
                                                                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                                                                    if (callDate < weekAgo) return false;
                                                                }
                                                                if (callFilters.dateRange === 'month') {
                                                                    const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                                                                    if (callDate < monthAgo) return false;
                                                                }
                                                            }

                                                            return true;
                                                        })
                                                        .sort((a, b) => {
                                                            let aValue, bValue;

                                                            switch (callFilters.sortBy) {
                                                                case 'duration':
                                                                    aValue = a.duration || 0;
                                                                    bValue = b.duration || 0;
                                                                    break;
                                                                case 'phoneNumber':
                                                                    aValue = a.phoneNumber || '';
                                                                    bValue = b.phoneNumber || '';
                                                                    break;
                                                                case 'endedAt':
                                                                default:
                                                                    aValue = new Date(a.endedAt || a.createdAt || 0).getTime();
                                                                    bValue = new Date(b.endedAt || b.createdAt || 0).getTime();
                                                                    break;
                                                            }

                                                            if (callFilters.sortOrder === 'asc') {
                                                                return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
                                                            } else {
                                                                return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
                                                            }
                                                        })
                                                        .map((call) => {
                                                            const derived = {
                                                                endedReason: getResolvedEndedReason(call),
                                                                durationSeconds: getResolvedDuration(call),
                                                                endedAt: getResolvedEndedAt(call),
                                                            };
                                                            const resolvedStatus = resolveCallStatus(call);
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
                                                                            <Avatar sx={{ width: 28, height: 28, fontSize: '0.7rem', bgcolor: call.status === 'failed' ? 'error.main' : 'success.main' }}>
                                                                                {(typeof call.leadId === 'object' ? call.leadId.firstName : '')?.[0] || ''}
                                                                                {(typeof call.leadId === 'object' ? call.leadId.lastName : '')?.[0] || ''}
                                                                            </Avatar>
                                                                            <Box>
                                                                                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                                                                                    {typeof call.leadId === 'object'
                                                                                        ? `${call.leadId.firstName || ''} ${call.leadId.lastName || ''}`.trim()
                                                                                        : 'Unknown Lead'}
                                                                                </Typography>
                                                                                {typeof call.leadId === 'object' && call.leadId.email && (
                                                                                    <Typography variant="caption" color="text.secondary">
                                                                                        {call.leadId.email}
                                                                                    </Typography>
                                                                                )}
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
                                                                    <Chip
                                                                        label={getStatusLabel(resolvedStatus)}
                                                                        size="small"
                                                                        color={getStatusChipColor(resolvedStatus)}
                                                                        sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                                                                    />
                                                                </TableCell>
                                                                <TableCell>
                                                                    {derived.endedReason ? (
                                                                        <Chip
                                                                            label={derived.endedReason}
                                                                            color={getEndedReasonColor(derived.endedReason)}
                                                                            size="small"
                                                                            sx={{
                                                                                fontWeight: 700,
                                                                                fontSize: '0.7rem',
                                                                                maxWidth: 200,
                                                                                '& .MuiChip-label': {
                                                                                    overflow: 'hidden',
                                                                                    textOverflow: 'ellipsis',
                                                                                    whiteSpace: 'nowrap'
                                                                                }
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', fontStyle: 'italic' }}>
                                                                            N/A
                                                                        </Typography>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                                                                        {formatDuration(derived.durationSeconds || call.duration || 0)}
                                                                    </Typography>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                                                                        {formatDateTime(derived.endedAt || call.endedAt)}
                                                                    </Typography>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
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
                                                                        <Tooltip title="View Call Details">
                                                                            <IconButton
                                                                                size="small"
                                                                                color="info"
                                                                                onClick={() => handleViewCallDetails(call)}
                                                                            >
                                                                                <Visibility fontSize="small" />
                                                                            </IconButton>
                                                                        </Tooltip>
                                                                        {call.leadId && (
                                                                            <Tooltip title="View Call History">
                                                                                <IconButton
                                                                                    size="small"
                                                                                    color="primary"
                                                                                    onClick={() => handleViewCallHistory(typeof call.leadId === 'object' ? (call.leadId._id || call.leadId) : call.leadId)}
                                                                                >
                                                                                    <History fontSize="small" />
                                                                                </IconButton>
                                                                            </Tooltip>
                                                                        )}
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
                                                        )})}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>

                                        {/* Pagination */}
                                        {completedCallsPagination.totalPages > 1 && (
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    Showing {((completedCallsPagination.page - 1) * completedCallsPagination.limit) + 1}-
                                                    {Math.min(completedCallsPagination.page * completedCallsPagination.limit, completedCallsPagination.total)} of {completedCallsPagination.total}
                                                </Typography>

                                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                                    <FormControl size="small" sx={{ minWidth: 80 }}>
                                                        <Select
                                                            value={completedCallsPagination.limit}
                                                            onChange={(e) => {
                                                                setCompletedCallsPagination(prev => ({ ...prev, limit: e.target.value, page: 1 }));
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
                                                        onClick={() => setCompletedCallsPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                                                        disabled={completedCallsPagination.page === 1}
                                                    >
                                                        <ChevronLeft />
                                                    </IconButton>

                                                    <Typography variant="body2">
                                                        Page {completedCallsPagination.page} of {completedCallsPagination.totalPages}
                                                    </Typography>

                                                    <IconButton
                                                        size="small"
                                                        onClick={() => setCompletedCallsPagination(prev => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))}
                                                        disabled={completedCallsPagination.page >= completedCallsPagination.totalPages}
                                                    >
                                                        <ChevronRight />
                                                    </IconButton>
                                                </Box>
                                            </Box>
                                        )}
                                    </>
                                )}

                                {/* Call Logs Modal */}
                                {canViewCallLogs && (
                                    <CallLogsModal
                                        open={logsModalOpen}
                                        onClose={() => {
                                            setLogsModalOpen(false);
                                            setLogsCallId(null);
                                        }}
                                        callId={logsCallId}
                                    />
                                )}
                            </CardContent>
                        </Card>

                        

                          {/* Statistics Breakdown */}
                        {statistics && statistics.byStatus && statistics.byStatus.length > 0 && (
                            <Card elevation={3} sx={{ mt: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                        <People color="primary" />
                                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                            Statistics by Status
                                        </Typography>
                                    </Box>
                                    <Grid container spacing={2}>
                                        {statistics.byStatus.map((stat) => (
                                            <Grid item xs={12} sm={6} md={4} key={stat._id}>
                                                <Paper variant="outlined" sx={{ p: 2 }}>
                                                    <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                                        {stat._id?.replace('-', ' ').toUpperCase() || 'UNKNOWN'}
                                                    </Typography>
                                                    <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                                                        {stat.count}
                                                    </Typography>
                                                    {stat.avgDuration > 0 && (
                                                        <Typography variant="caption" color="text.secondary">
                                                            Avg Duration: {formatDuration(Math.round(stat.avgDuration))}
                                                        </Typography>
                                                    )}
                                                </Paper>
                                            </Grid>
                                        ))}
                                    </Grid>
                                </CardContent>
                            </Card>
                        )}

                        {/* Delete Call Confirmation Dialog */}
                        {/* Call Details Modal */}
                        <Dialog
                            open={callDetailsOpen}
                            onClose={() => {
                                setCallDetailsOpen(false);
                                setSelectedCall(null);
                            }}
                            maxWidth="md"
                            fullWidth
                        >
                            <DialogTitle>
                                <Box display="flex" alignItems="center" justifyContent="space-between">
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <PhoneInTalk color="primary" />
                                        <Typography variant="h6">Call Details</Typography>
                                    </Box>
                                    {selectedCall && (
                                        <Chip
                                            label={getStatusLabel(resolveCallStatus(selectedCall))}
                                            color={getStatusChipColor(resolveCallStatus(selectedCall))}
                                            size="small"
                                        />
                                    )}
                                </Box>
                            </DialogTitle>
                            <DialogContent>
                                {selectedCall && (
                                    <Box sx={{ mt: 2 }}>
                                        <Grid container spacing={3}>
                                            {/* Lead Information */}
                                            <Grid item xs={12} md={6}>
                                                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                                    Lead Information
                                                </Typography>
                                                <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                                                    {selectedCall.leadId ? (
                                                        <>
                                                            <Typography variant="body1" sx={{ fontWeight: 600, mb: 1 }}>
                                                                {typeof selectedCall.leadId === 'object'
                                                                    ? `${selectedCall.leadId.firstName || ''} ${selectedCall.leadId.lastName || ''}`.trim()
                                                                    : 'Unknown Lead'}
                                                            </Typography>
                                                            {typeof selectedCall.leadId === 'object' && selectedCall.leadId.email && (
                                                                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                                                                    📧 {selectedCall.leadId.email}
                                                                </Typography>
                                                            )}
                                                            {typeof selectedCall.leadId === 'object' && selectedCall.leadId.phone && (
                                                                <Typography variant="body2" color="text.secondary">
                                                                    📞 {selectedCall.leadId.phone}
                                                                </Typography>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <Typography variant="body2" color="text.secondary">
                                                            No lead information available
                                                        </Typography>
                                                    )}
                                                </Box>
                                            </Grid>

                                            {/* Call Information */}
                                            <Grid item xs={12} md={6}>
                                                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                                    Call Information
                                                </Typography>
                                                <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                                                    {selectedCallDerived?.endedReason && (
                                                        <Box sx={{ mb: 2, pb: 2, borderBottom: 1, borderColor: 'divider' }}>
                                                            <Typography variant="caption" color="text.secondary" display="block" gutterBottom sx={{ fontWeight: 600, mb: 1 }}>
                                                                Ended Reason (Vapi AI):
                                                            </Typography>
                                                            <Chip
                                                                label={selectedCallDerived.endedReason}
                                                                color={getEndedReasonColor(selectedCallDerived.endedReason)}
                                                                sx={{
                                                                    fontWeight: 700,
                                                                    fontSize: '0.875rem',
                                                                    py: 2,
                                                                    px: 2,
                                                                    height: 'auto',
                                                                    borderRadius: 2,
                                                                    boxShadow: 2,
                                                                    '& .MuiChip-label': {
                                                                        px: 1.5,
                                                                        py: 0.5
                                                                    }
                                                                }}
                                                            />
                                                        </Box>
                                                    )}
                                                    <Typography variant="body2" sx={{ mb: 1 }}>
                                                        <strong>Phone:</strong> {selectedCall.phoneNumber || 'N/A'}
                                                    </Typography>
                                                    <Typography variant="body2" sx={{ mb: 1 }}>
                                                        <strong>Duration:</strong> {formatDuration(selectedCallDerived?.durationSeconds || selectedCall.duration || 0)}
                                                    </Typography>
                                                    {selectedCall.ringingTime && (
                                                        <Typography variant="body2" sx={{ mb: 1 }}>
                                                            <strong>Ringing Time:</strong> {formatDuration(selectedCall.ringingTime)}
                                                        </Typography>
                                                    )}
                                                    {selectedCall.activeCallTime && (
                                                        <Typography variant="body2" sx={{ mb: 1 }}>
                                                            <strong>Active Call Time:</strong> {formatDuration(selectedCall.activeCallTime)}
                                                        </Typography>
                                                    )}
                                                </Box>
                                            </Grid>

                                            {/* Timestamps */}
                                            <Grid item xs={12} md={6}>
                                                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                                    Timestamps
                                                </Typography>
                                                <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                                                    {(selectedCallDerived?.startedAt || selectedCall.startedAt) && (
                                                        <Typography variant="body2" sx={{ mb: 1 }}>
                                                            <strong>Started:</strong> {formatDateTime(selectedCallDerived?.startedAt || selectedCall.startedAt)}
                                                        </Typography>
                                                    )}
                                                    {(selectedCallDerived?.endedAt || selectedCall.endedAt) && (
                                                        <Typography variant="body2" sx={{ mb: 1 }}>
                                                            <strong>Ended:</strong> {formatDateTime(selectedCallDerived?.endedAt || selectedCall.endedAt)}
                                                        </Typography>
                                                    )}
                                                    {selectedCall.createdAt && (
                                                        <Typography variant="body2">
                                                            <strong>Created:</strong> {formatDateTime(selectedCall.createdAt)}
                                                        </Typography>
                                                    )}
                                                </Box>
                                            </Grid>

                                            {/* Session Information */}
                                            <Grid item xs={12} md={6}>
                                                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                                    Session Information
                                                </Typography>
                                                <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                                                    {selectedCall.sessionId && (
                                                        <Typography variant="body2" sx={{ mb: 1, wordBreak: 'break-all' }}>
                                                            <strong>Session ID:</strong> {selectedCall.sessionId}
                                                        </Typography>
                                                    )}
                                                    {selectedCall.metadata?.voipSessionId && (
                                                        <Typography variant="body2" sx={{ mb: 1, wordBreak: 'break-all' }}>
                                                            <strong>VoIP Session ID:</strong> {selectedCall.metadata.voipSessionId}
                                                        </Typography>
                                                    )}
                                                    {selectedCall.metadata?.retryAttempts !== undefined && (
                                                        <Typography variant="body2">
                                                            <strong>Retry Attempts:</strong> {selectedCall.metadata.retryAttempts}
                                                        </Typography>
                                                    )}
                                                </Box>
                                            </Grid>

                                            {/* Summary */}
                                            {selectedCall.summary && (
                                                <Grid item xs={12}>
                                                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                                        Call Summary
                                                    </Typography>
                                                    <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1, maxHeight: 300, overflow: 'auto' }}>
                                                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: 'text.primary' }}>
                                                            {selectedCall.summary}
                                                        </Typography>
                                                    </Box>
                                                </Grid>
                                            )}

                                            {/* Vapi AI Call Details Summary */}
                                            {selectedCall.metadata?.vapiCallId && vapiCallDetails && (
                                                <Grid item xs={12}>
                                                    <Box sx={{ p: 2, bgcolor: 'primary.light', borderRadius: 2, mb: 2, border: '2px solid', borderColor: 'primary.main' }}>
                                                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                            <SmartToy />
                                                            Vapi AI Call Details
                                                        </Typography>
                                                        <Grid container spacing={2}>
                                                            {vapiCallDetails.endedReason && (
                                                                <Grid item xs={12}>
                                                                    <Box sx={{ p: 1.5, bgcolor: 'warning.light', borderRadius: 1, border: '1px solid', borderColor: 'warning.main' }}>
                                                                        <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                                                                            ENDED REASON:
                                                                        </Typography>
                                                                        <Chip
                                                                            label={vapiCallDetails.endedReason.toUpperCase()}
                                                                            color={getEndedReasonColor(vapiCallDetails.endedReason)}
                                                                            sx={{ 
                                                                                fontWeight: 700, 
                                                                                fontSize: '0.875rem',
                                                                                height: 32,
                                                                                boxShadow: 2
                                                                            }}
                                                                        />
                                                                    </Box>
                                                                </Grid>
                                                            )}
                                                            <Grid item xs={6} sm={3}>
                                                                <Typography variant="caption" color="text.secondary" display="block">
                                                                    Status
                                                                </Typography>
                                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                    {vapiCallDetails.status || vapiCallDetails.state || 'N/A'}
                                                                </Typography>
                                                            </Grid>
                                                            {vapiCallDetails.duration !== undefined && (
                                                                <Grid item xs={6} sm={3}>
                                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                                        Duration
                                                                    </Typography>
                                                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                        {formatDuration(vapiCallDetails.duration)}
                                                                    </Typography>
                                                                </Grid>
                                                            )}
                                                            {vapiCallDetails.cost !== undefined && vapiCallDetails.cost !== null && (
                                                                <Grid item xs={6} sm={3}>
                                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                                        Cost
                                                                    </Typography>
                                                                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
                                                                        ${vapiCallDetails.cost}
                                                                    </Typography>
                                                                </Grid>
                                                            )}
                                                            {vapiCallDetails.messagesCount !== undefined && (
                                                                <Grid item xs={6} sm={3}>
                                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                                        Messages
                                                                    </Typography>
                                                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                        {vapiCallDetails.messagesCount}
                                                                    </Typography>
                                                                </Grid>
                                                            )}
                                                        </Grid>
                                                    </Box>
                                                </Grid>
                                            )}

                                            {/* Vapi AI Call Logs */}
                                            {canViewCallLogs && selectedCall.metadata?.vapiCallId && (
                                                <Grid item xs={12}>
                                                    <Accordion defaultExpanded={false}>
                                                        <AccordionSummary
                                                            expandIcon={<ExpandMore />}
                                                            sx={{
                                                                bgcolor: 'primary.light',
                                                                borderRadius: 1,
                                                                '&:hover': {
                                                                    bgcolor: 'primary.main',
                                                                    color: 'primary.contrastText'
                                                                }
                                                            }}
                                                        >
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                                                                <Description color="inherit" />
                                                                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                                                    Vapi AI Call Logs
                                                                </Typography>
                                                                {callLogs.length > 0 && (
                                                                    <Chip
                                                                        label={callLogs.length}
                                                                        size="small"
                                                                        sx={{ ml: 'auto' }}
                                                                    />
                                                                )}
                                                            </Box>
                                                        </AccordionSummary>
                                                        <AccordionDetails>
                                                            {loadingLogs ? (
                                                                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                                                    <CircularProgress />
                                                                </Box>
                                                            ) : logsError ? (
                                                                <Box sx={{ p: 2, textAlign: 'center' }}>
                                                                    <ErrorIcon color="error" sx={{ fontSize: 48, mb: 1 }} />
                                                                    <Typography variant="body2" color="error">
                                                                        {logsError}
                                                                    </Typography>
                                                                </Box>
                                                            ) : callLogs.length === 0 ? (
                                                                <Box sx={{ p: 2, textAlign: 'center' }}>
                                                                    <Typography variant="body2" color="text.secondary">
                                                                        No logs available for this call
                                                                    </Typography>
                                                                </Box>
                                                            ) : (
                                                                <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                                                                    <Stack spacing={1}>
                                                                        {callLogs.map((log, index) => {
                                                                            const logType = log.type || 'message';
                                                                            const isError = logType === 'error';
                                                                            const isStatus = logType === 'status' || logType === 'call_started';
                                                                            const isEnded = logType === 'ended';
                                                                            const isUser = log.role === 'user';
                                                                            const isTranscript = logType === 'transcript' || logType === 'transcript_message';
                                                                            const isSummary = logType === 'summary';
                                                                            const isCost = logType === 'cost';
                                                                            const isMetadata = logType === 'metadata';

                                                                            // Get color based on log type
                                                                            let borderColor = 'primary.main';
                                                                            let bgColor = 'background.paper';
                                                                            let chipColor = 'default';
                                                                            
                                                                            if (isError) {
                                                                                borderColor = 'error.main';
                                                                                bgColor = 'error.light';
                                                                                chipColor = 'error';
                                                                            } else if (isEnded) {
                                                                                borderColor = 'warning.main';
                                                                                bgColor = 'warning.light';
                                                                                chipColor = 'warning';
                                                                            } else if (isStatus) {
                                                                                borderColor = 'info.main';
                                                                                bgColor = 'info.light';
                                                                                chipColor = 'info';
                                                                            } else if (isUser) {
                                                                                borderColor = 'success.main';
                                                                                bgColor = 'success.light';
                                                                                chipColor = 'success';
                                                                            } else if (isTranscript) {
                                                                                borderColor = 'secondary.main';
                                                                                bgColor = 'secondary.light';
                                                                                chipColor = 'secondary';
                                                                            } else if (isSummary) {
                                                                                borderColor = 'primary.main';
                                                                                bgColor = 'primary.light';
                                                                                chipColor = 'primary';
                                                                            } else if (isCost) {
                                                                                borderColor = 'success.main';
                                                                                bgColor = 'success.light';
                                                                                chipColor = 'success';
                                                                            }
                                                                            
                                                                            return (
                                                                                <Paper
                                                                                    key={index}
                                                                                    elevation={isEnded ? 3 : 1}
                                                                                    sx={{
                                                                                        p: isEnded ? 2 : 1.5,
                                                                                        borderRadius: 1,
                                                                                        borderLeft: '4px solid',
                                                                                        borderColor: borderColor,
                                                                                        bgcolor: bgColor,
                                                                                        ...(isEnded && {
                                                                                            boxShadow: 3,
                                                                                            border: '2px solid',
                                                                                            borderColor: borderColor,
                                                                                        })
                                                                                    }}
                                                                                >
                                                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                                                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                                                            <Chip
                                                                                                label={logType.replace('_', ' ').toUpperCase()}
                                                                                                size="small"
                                                                                                color={chipColor}
                                                                                                sx={{ fontWeight: 700, fontSize: '0.65rem' }}
                                                                                            />
                                                                                            {log.role && (
                                                                                                <Chip
                                                                                                    label={log.role === 'user' ? 'User' : log.role === 'assistant' ? 'Assistant' : log.role}
                                                                                                    size="small"
                                                                                                    color={log.role === 'user' ? 'success' : 'primary'}
                                                                                                    sx={{ fontWeight: 600, fontSize: '0.65rem' }}
                                                                                                />
                                                                                            )}
                                                                                            {isEnded && log.data?.endedReason && (
                                                                                                <Chip
                                                                                                    label={log.data.endedReason.toUpperCase()}
                                                                                                    size="small"
                                                                                                    color="warning"
                                                                                                    sx={{ 
                                                                                                        fontWeight: 700, 
                                                                                                        fontSize: '0.7rem',
                                                                                                        height: 24,
                                                                                                        boxShadow: 2
                                                                                                    }}
                                                                                                />
                                                                                            )}
                                                                                        </Box>
                                                                                        <Typography variant="caption" color="text.secondary">
                                                                                            {formatDateTime(log.timestamp)}
                                                                                        </Typography>
                                                                                    </Box>
                                                                                    <Typography
                                                                                        variant={isEnded ? "body1" : "body2"}
                                                                                        sx={{ 
                                                                                            fontWeight: isEnded ? 700 : 600, 
                                                                                            mb: 0.5,
                                                                                            color: isEnded ? 'warning.dark' : 'text.primary'
                                                                                        }}
                                                                                    >
                                                                                        {log.message}
                                                                                    </Typography>
                                                                                    {log.data && typeof log.data === 'object' && Object.keys(log.data).length > 0 && (
                                                                                        <Box sx={{ mt: 1, p: 1.5, bgcolor: 'background.default', borderRadius: 0.5, border: '1px solid', borderColor: 'divider' }}>
                                                                                            {isEnded && log.data.endedReason && (
                                                                                                <Box sx={{ mb: 1, p: 1, bgcolor: 'warning.light', borderRadius: 0.5 }}>
                                                                                                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                                                                                                        ENDED REASON:
                                                                                                    </Typography>
                                                                                                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'warning.dark' }}>
                                                                                                        {log.data.endedReason}
                                                                                                    </Typography>
                                                                                                </Box>
                                                                                            )}
                                                                                            {isTranscript && log.data.transcript && (
                                                                                                <Box sx={{ mb: 1 }}>
                                                                                                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                                                                                                        TRANSCRIPT:
                                                                                                    </Typography>
                                                                                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>
                                                                                                        {typeof log.data.transcript === 'string' ? log.data.transcript : JSON.stringify(log.data.transcript)}
                                                                                                    </Typography>
                                                                                                </Box>
                                                                                            )}
                                                                                            {isSummary && log.data.summary && (
                                                                                                <Box sx={{ mb: 1 }}>
                                                                                                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                                                                                                        SUMMARY:
                                                                                                    </Typography>
                                                                                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                                                                                        {log.data.summary}
                                                                                                    </Typography>
                                                                                                </Box>
                                                                                            )}
                                                                                            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: '0.7rem' }}>
                                                                                                {JSON.stringify(log.data, null, 2)}
                                                                                            </Typography>
                                                                                        </Box>
                                                                                    )}
                                                                                </Paper>
                                                                            );
                                                                        })}
                                                                    </Stack>
                                                                </Box>
                                                            )}
                                                        </AccordionDetails>
                                                    </Accordion>
                                                </Grid>
                                            )}

                                            {/* SIP Events */}
                                            {selectedCall.metadata?.sipEvents && selectedCall.metadata.sipEvents.length > 0 && (
                                                <Grid item xs={12}>
                                                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                                        SIP Events ({selectedCall.metadata.sipEvents.length})
                                                    </Typography>
                                                    <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1, maxHeight: 200, overflow: 'auto' }}>
                                                        <Stack spacing={1}>
                                                            {selectedCall.metadata.sipEvents.map((event, index) => {
                                                                const eventData = typeof event === 'string' ? JSON.parse(event) : event;
                                                                return (
                                                                    <Box key={index} sx={{ p: 1, bgcolor: 'white', borderRadius: 0.5 }}>
                                                                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                                                            {eventData.code || 'N/A'}: {eventData.message || 'N/A'}
                                                                        </Typography>
                                                                        {eventData.timestamp && (
                                                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                                                                {formatDateTime(eventData.timestamp)}
                                                                            </Typography>
                                                                        )}
                                                                    </Box>
                                                                );
                                                            })}
                                                        </Stack>
                                                    </Box>
                                                </Grid>
                                            )}
                                        </Grid>
                                    </Box>
                                )}
                            </DialogContent>
                            <DialogActions>
                                <Button onClick={() => {
                                    setCallDetailsOpen(false);
                                    setSelectedCall(null);
                                }}>
                                    Close
                                </Button>
                                {selectedCall?.leadId && (
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        startIcon={<History />}
                                        onClick={() => {
                                            handleViewCallHistory(typeof selectedCall.leadId === 'object' ? (selectedCall.leadId._id || selectedCall.leadId) : selectedCall.leadId);
                                            setCallDetailsOpen(false);
                                            setSelectedCall(null);
                                        }}
                                    >
                                        View History
                                    </Button>
                                )}
                            </DialogActions>
                        </Dialog>

                        {/* Delete Confirmation Dialog */}
                        <Dialog
                            open={deleteCallConfirm !== null}
                            onClose={() => !deletingCall && setDeleteCallConfirm(null)}
                            maxWidth="sm"
                            fullWidth
                        >
                            <DialogTitle>
                                <Box display="flex" alignItems="center" gap={1}>
                                    <DeleteIcon color="error" />
                                    <Typography variant="h6">Confirm Delete</Typography>
                                </Box>
                            </DialogTitle>
                            <DialogContent>
                                <Typography sx={{ mb: 2 }}>
                                    Are you sure you want to delete this call? This action cannot be undone.
                                </Typography>
                                {(() => {
                                    const callToDelete = [...completedCalls, ...cancelledCalls, ...callsWithSummaries].find(c => c._id === deleteCallConfirm);
                                    const hasLead = callToDelete?.leadId;
                                    return hasLead ? (
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                                            <Checkbox
                                                checked={deleteLeadCheckbox}
                                                onChange={(e) => setDeleteLeadCheckbox(e.target.checked)}
                                                disabled={deletingCall}
                                            />
                                            <Typography variant="body2">
                                                Also delete the lead from the system
                                            </Typography>
                                        </Box>
                                    ) : null;
                                })()}
                            </DialogContent>
                            <DialogActions>
                                <Button onClick={() => {
                                    setDeleteCallConfirm(null);
                                    setDeleteLeadCheckbox(false);
                                }} disabled={deletingCall}>
                                    Cancel
                                </Button>
                                <Button
                                    variant="contained"
                                    color="error"
                                    onClick={() => handleDeleteCall(deleteCallConfirm, deleteLeadCheckbox)}
                                    disabled={deletingCall}
                                    startIcon={deletingCall ? <CircularProgress size={20} /> : <DeleteIcon />}
                                >
                                    {deletingCall ? 'Deleting...' : 'Delete'}
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
                                    const allCalls = [...completedCalls, ...cancelledCalls];
                                    const hasAnyLead = selectedCalls.some(callId => {
                                        const call = allCalls.find(c => c._id === callId);
                                        return call?.leadId;
                                    });
                                    return hasAnyLead ? (
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

export default CallDashboard;

