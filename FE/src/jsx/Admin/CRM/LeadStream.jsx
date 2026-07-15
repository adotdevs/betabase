import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import sseClient from '../../../utils/sseClient';
import {
    Box,
    Paper,
    Typography,
    Card,
    CardContent,
    IconButton,
    AppBar,
    Toolbar,
    TextField,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    CircularProgress,
    Divider,
    Avatar,
    Stack,
    Grid,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Tabs,
    Tab,
    InputAdornment,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Menu,
    Autocomplete,
    Accordion,
    AccordionSummary,
    AccordionDetails,
} from '@mui/material';
import {
    ArrowBack,
    Send,
    Menu as MenuIcon,
    Person,
    Email,
    Phone,
    PhoneCallback,
    LocationOn,
    Business,
    Refresh,
    Edit,
    Save,
    Close,
    Check,
    FilterList,
    History,
    Comment as CommentIcon,
    Info,
    CalendarToday,
    People,
    Delete as DeleteIcon,
    MoreVert,
    ThumbUp,
    ThumbUpOutlined,
    PushPin,
    PushPinOutlined,
    Flag,
    FlagOutlined,
    Reply,
    FormatQuote,
    HistoryOutlined,
    AttachFile,
    Search,
    GetApp,
    AlternateEmail,
    PhoneInTalk,
    PhoneDisabled,
    CheckCircle,
    Cancel,
    AccessTime,
    Timer,
    PlayArrow,
    Stop,
    Schedule,
    ChevronLeft,
    ChevronRight,
    SmartToy,
    Person as PersonIcon,
    ExpandMore,
    DeleteSweep,
    Alarm,
    Error as ErrorIcon,
    Description,
    Add,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import Sidebar from './Sidebar.js';
import CrmAppBarActions from './components/CrmAppBarActions';
import CallLogsModal from './components/CallLogsModal';
import ReminderModal from './components/ReminderModal';
import InlineLeadStatusCell from './components/InlineLeadStatusCell';
import { 
    getLeadWithActivityApi, 
    addLeadCommentApi, 
    updateLeadApi, 
    allUsersApi, 
    assignLeadsApi,
    editCommentApi,
    deleteCommentApi,
    toggleLikeCommentApi,
    togglePinCommentApi,
    toggleImportantCommentApi,
    addQuoteReplyApi,
    addNestedReplyApi,
    getCommentHistoryApi,
    getNestedRepliesApi,
    searchCommentsApi,
    getCallHistoryApi,
    initiateCallApi,
    cancelCallApi,
    getCallStatusApi,
    getActiveCallsApi,
    adminCrmLeadsApi,
    deleteCallApi,
    deleteCallHistoryApi,
    getRemindersApi,
    updateReminderApi,
    deleteReminderApi,
} from '../../../Api/Service';
import { useAuthUser } from 'react-auth-kit';
import { mapSipEventsToStatus } from '../../../utils/callStatus';
import { formatReminderDateTime } from '../../../utils/reminderTimezone';
import LeadEditableField from './components/LeadEditableField';

const resolveCallMetadata = (call) => {
    const metadata = call?.metadata || {};
    const webhookPayload = metadata.vapiWebhookPayload || {};
    const messagePayload = webhookPayload.message || {};
    const nestedCall = webhookPayload.call || messagePayload.call || {};
    const artifact = messagePayload.artifact || webhookPayload.artifact || {};
    return { metadata, webhookPayload, messagePayload, nestedCall, artifact };
};

const getResolvedEndedReason = (call) => {
    // PRIORITY 1: Direct metadata fields (most reliable - set by webhook handler)
    if (call?.metadata?.vapiEndedReason) {
        return call.metadata.vapiEndedReason;
    }
    if (call?.metadata?.endedReason) {
        return call.metadata.endedReason;
    }
    
    // PRIORITY 2: Direct call.endedReason field (if exists)
    if (call.endedReason) {
        return call.endedReason;
    }
    
    // PRIORITY 3: Check logs array for the most recent endedReason (when logs are available)
    if (call.logs && Array.isArray(call.logs) && call.logs.length > 0) {
        for (let i = call.logs.length - 1; i >= 0; i--) {
            const log = call.logs[i];
            if (log && typeof log === 'object' && log.data) {
                // Check log.data.endedReason (from status-update events)
                if (log.data.endedReason) {
                    return log.data.endedReason;
                }
                // Check log.data.fullPayload.message.endedReason (from webhook payloads)
                if (log.data.fullPayload?.message?.endedReason) {
                    return log.data.fullPayload.message.endedReason;
                }
            }
        }
    }
    
    // PRIORITY 4: Check webhook payload structure
    const { metadata, webhookPayload, messagePayload, nestedCall, artifact } = resolveCallMetadata(call);
    
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
    
    // PRIORITY 6: Check artifact object (from end-of-call-report)
    if (artifact?.endedReason) {
        return artifact.endedReason;
    }
    
    // PRIORITY 7: Check nested call object
    if (nestedCall?.endedReason) {
        return nestedCall.endedReason;
    }
    
    // PRIORITY 8: Legacy error field
    if (call.error) {
        return call.error;
    }
    
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
    const { metadata, webhookPayload, nestedCall } = resolveCallMetadata(call);
    return (
        call.duration ??
        metadata.vapiDuration ??
        webhookPayload.durationSeconds ??
        webhookPayload.duration ??
        nestedCall.duration ??
        0
    );
};


const LeadStream = () => {
    const { leadId } = useParams();
    const navigate = useNavigate();
    const authUser = useAuthUser();
    const [loading, setLoading] = useState(true);
    const [lead, setLead] = useState(null);
    const [activities, setActivities] = useState([]);
    const [totalActivities, setTotalActivities] = useState(0);
    const [newComment, setNewComment] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isMobileMenu, setIsMobileMenu] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    
    // Edit states
    const [editMode, setEditMode] = useState({});
    const [editValues, setEditValues] = useState({});
    const [saving, setSaving] = useState({});
    
    // Filter states
    const [activityFilter, setActivityFilter] = useState('all');
    const [currentTab, setCurrentTab] = useState(1); // Start with Call History tab (index 0)
    
    // Call History states
    const [callHistory, setCallHistory] = useState([]);
    const [loadingCallHistory, setLoadingCallHistory] = useState(false);
    const [callingLead, setCallingLead] = useState(false);
    const [activeCallSessionId, setActiveCallSessionId] = useState(null);
    const [currentCallStatus, setCurrentCallStatus] = useState(null); // Track current call status
    const [logsCallId, setLogsCallId] = useState(null);
    const [logsModalOpen, setLogsModalOpen] = useState(false);
    
    // Navigation states
    const [adjacentLeads, setAdjacentLeads] = useState({ prev: null, next: null });
    const [loadingNavigation, setLoadingNavigation] = useState(false);
    
    // Permission states
    const [currentUserLatest, setCurrentUserLatest] = useState(null);
    const [agents, setAgents] = useState([]);
    const [assignDialogOpen, setAssignDialogOpen] = useState(false);
    const [selectedAgentId, setSelectedAgentId] = useState('');
    const [assigning, setAssigning] = useState(false);
    const [canEdit, setCanEdit] = useState(false);
    const [canAssign, setCanAssign] = useState(false);
    const canManageStatuses = useMemo(() => (
        currentUserLatest?.role === 'superadmin'
        || (currentUserLatest?.role === 'admin' && currentUserLatest?.adminPermissions?.canManageCrmLeads)
    ), [currentUserLatest]);
    const canMakeCalls = useMemo(() => {
        if (!currentUserLatest) return true; // fallback; backend will enforce
        if (currentUserLatest.role === 'superadmin') return true;
        if (currentUserLatest.role === 'admin') return !!currentUserLatest.adminPermissions?.canMakeCalls;
        return true;
    }, [currentUserLatest]);
    
    const canViewCallLogs = useMemo(() => {
        if (!currentUserLatest) return false; // fallback; default to false for safety
        if (currentUserLatest.role === 'superadmin') return true;
        if (currentUserLatest.role === 'admin') return !!currentUserLatest.adminPermissions?.canViewCallLogs;
        if (currentUserLatest.role === 'subadmin') return !!currentUserLatest.permissions?.canViewCallLogs;
        return false;
    }, [currentUserLatest]);
    
    const canViewCallRecordings = useMemo(() => {
        if (!currentUserLatest) return false; // fallback; default to false for safety
        if (currentUserLatest.role === 'superadmin') return true;
        if (currentUserLatest.role === 'admin') return !!currentUserLatest.adminPermissions?.canViewCallRecordings;
        if (currentUserLatest.role === 'subadmin') return !!currentUserLatest.permissions?.canViewCallRecordings;
        return false;
    }, [currentUserLatest]);
    
    // ✅ NEW: Comment Feature States
    const [commentMenuAnchor, setCommentMenuAnchor] = useState(null);
    const [selectedComment, setSelectedComment] = useState(null);
    const [editCommentDialogOpen, setEditCommentDialogOpen] = useState(false);
    const [editCommentContent, setEditCommentContent] = useState('');
    const [editCommentReason, setEditCommentReason] = useState('');
    const [editingComment, setEditingComment] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deletingComment, setDeletingComment] = useState(false);
    const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
    const [commentHistory, setCommentHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [quoteReplyDialogOpen, setQuoteReplyDialogOpen] = useState(false);
    const [quoteReplyContent, setQuoteReplyContent] = useState('');
    const [addingQuoteReply, setAddingQuoteReply] = useState(false);
    const [nestedReplyDialogOpen, setNestedReplyDialogOpen] = useState(false);
    const [nestedReplyContent, setNestedReplyContent] = useState('');
    const [addingNestedReply, setAddingNestedReply] = useState(false);
    const [expandedReplies, setExpandedReplies] = useState(new Set());
    const [nestedReplies, setNestedReplies] = useState({});
    const [loadingReplies, setLoadingReplies] = useState({});
    const [commentSearch, setCommentSearch] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [likesDialogOpen, setLikesDialogOpen] = useState(false);
    const [selectedLikes, setSelectedLikes] = useState([]);
    const [reminders, setReminders] = useState([]);
    const [reminderModalOpen, setReminderModalOpen] = useState(false);
    const [editingReminder, setEditingReminder] = useState(null);
    const [updatingLeadStatus, setUpdatingLeadStatus] = useState(false);

    // Get user permissions and check access
    const getUserPermissions = useCallback(async () => {
        try {
            const currentUser = authUser().user;

            // ✅ SECURITY: Fetch current user's latest data BY ID (not email to avoid duplicates)
            const currentUserResponse = await allUsersApi({ 
                search: currentUser._id,  // Search by ID instead of email!
                limit: 1 
            });

            if (!currentUserResponse.success || currentUserResponse.allUsers.length === 0) {
                toast.error("Failed to fetch user data");
                navigate("/admin/dashboard/crm");
                return;
            }

            const updatedCurrentUser = currentUserResponse.allUsers[0];
            setCurrentUserLatest(updatedCurrentUser);

            // ✅ KEEP: Important for debugging authentication issues
            if (updatedCurrentUser.role !== authUser().user.role) {
                console.warn('⚠️ Role mismatch detected:', {
                    expected: authUser().user.role,
                    actual: updatedCurrentUser.role,
                    user: updatedCurrentUser.email
                });
            }
            // ✅ SECURITY: Check CRM access permissions
            if (updatedCurrentUser.role === "admin" || authUser().user.role === "manager") {
                if (!updatedCurrentUser.adminPermissions?.accessCrm) {
                    toast.error("Access denied: No CRM permission");
                    navigate("/admin/dashboard/crm");
                    return;
                }
            } else if (updatedCurrentUser.role === "subadmin") {
                if (!updatedCurrentUser.permissions?.accessCrm) {
                    toast.error("Access denied: No CRM permission");
                    navigate("/admin/dashboard/crm");
                    return;
                }
            } else if (updatedCurrentUser.role === "user") {
                toast.error("Access denied: This is an admin area");
                navigate("/dashboard");
                return;
            }

            // Set edit permission
            const canUserEdit = updatedCurrentUser.role === 'superadmin' || 
                               (updatedCurrentUser.role === 'admin' && updatedCurrentUser.adminPermissions?.canManageCrmLeads);
            setCanEdit(canUserEdit);

            // Set assign permission
            const canUserAssign = updatedCurrentUser.role === 'superadmin' || 
                                 (updatedCurrentUser.role === 'admin' && updatedCurrentUser.adminPermissions?.canManageCrmLeads);
            setCanAssign(canUserAssign);

            // Fetch agents if can assign
            if (canUserAssign) {
                let agentsList = [];
                if (updatedCurrentUser.role === "superadmin") {
                    const [adminsResponse, subadminsResponse] = await Promise.all([
                        allUsersApi({ role: 'admin', limit: 1000 }),
                        allUsersApi({ role: 'subadmin', limit: 1000 })
                    ]);
                    
                    const allFetchedAgents = [
                        ...(adminsResponse.success ? adminsResponse.allUsers : []),
                        ...(subadminsResponse.success ? subadminsResponse.allUsers : [])
                    ];

                    // ✅ DEDUPLICATION: Check if current user already exists in fetched agents
                    const currentUserExists = allFetchedAgents.some(agent => agent._id === updatedCurrentUser._id);
                    
                    agentsList = currentUserExists 
                        ? allFetchedAgents 
                        : [...allFetchedAgents, updatedCurrentUser]; // Include self only if not already present
                        
                } else if (updatedCurrentUser.role === "admin") {
                    const subadminsResponse = await allUsersApi({ role: 'subadmin', limit: 1000 });
                    agentsList = subadminsResponse.success ? subadminsResponse.allUsers : [];
                }
                setAgents(agentsList);
            }

        } catch (error) {
            console.error('Error fetching permissions:', error);
            toast.error("Error loading permissions");
            navigate("/admin/dashboard/crm");
        }
    }, []); // ✅ EMPTY dependencies - only run once on mount

    useEffect(() => {
        getUserPermissions();
    }, []); // ✅ EMPTY dependencies - only call getUserPermissions once on mount

    // Mobile menu handling
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 768) {
                setIsMobileMenu(false);
                setIsSidebarCollapsed(false);
            } else {
                setIsMobileMenu(true);
            }
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const fetchLeadData = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            setRefreshing(true);
            
            const response = await getLeadWithActivityApi(leadId);
            const remindersResponse = await getRemindersApi({ leadId }).catch(() => ({ success: false }));

            if (response.success) {
                const fetchedLead = response.lead;
                
                setLead(fetchedLead);
                setActivities(response.activities);
                setTotalActivities(response.totalActivities);
                if (remindersResponse.success) {
                    setReminders(remindersResponse.reminders || []);
                }
                
                // Initialize edit values only once
                setEditValues(prev => {
                    if (Object.keys(prev).length === 0) {
                        return {
                            firstName: fetchedLead.firstName || '',
                            lastName: fetchedLead.lastName || '',
                            email: fetchedLead.email || '',
                            phone: fetchedLead.phone || '',
                            country: fetchedLead.country || '',
                            Brand: fetchedLead.Brand || '',
                            Address: fetchedLead.Address || '',
                            status: fetchedLead.status || 'New',
                        };
                    }
                    return prev;
                });
                
                // Fetch adjacent leads for navigation
                fetchAdjacentLeads(fetchedLead);
            } else {
                const errorMsg = response.message || 'Failed to load lead data';
                toast.error(errorMsg);
                // If access denied, redirect to leads page
                if (errorMsg.includes('Access denied')) {
                    setTimeout(() => navigate('/admin/dashboard/crm'), 1500);
                }
            }
        } catch (error) {
            console.error('❌ Error fetching lead data:', error); // ✅ KEEP: Error logging is important
            if (!silent) {
                toast.error('Error loading lead stream');
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [leadId]);

    const fetchReminders = useCallback(async () => {
        if (!leadId) return;
        try {
            const response = await getRemindersApi({ leadId });
            if (response.success) {
                setReminders(response.reminders || []);
            }
        } catch (error) {
            console.error('Failed to fetch reminders:', error);
        }
    }, [leadId]);

    const handleCompleteReminder = async (reminder) => {
        try {
            const response = await updateReminderApi(reminder._id, { status: 'completed' });
            if (response.success) {
                toast.success('Reminder marked as completed');
                fetchReminders();
            } else {
                toast.error(response.msg || 'Failed to update reminder');
            }
        } catch (error) {
            toast.error('Failed to update reminder');
        }
    };

    const handleDeleteReminder = async (reminder) => {
        if (!window.confirm('Move this reminder to trash?')) return;
        try {
            const response = await deleteReminderApi(reminder._id);
            if (response.success) {
                toast.success('Reminder moved to trash');
                fetchReminders();
            } else {
                toast.error(response.msg || 'Failed to delete reminder');
            }
        } catch (error) {
            toast.error('Failed to delete reminder');
        }
    };

    const openReminderModal = (reminder = null) => {
        setEditingReminder(reminder);
        setReminderModalOpen(true);
    };

    // Fetch adjacent leads for navigation
    const fetchAdjacentLeads = useCallback(async (currentLead) => {
        try {
            setLoadingNavigation(true);
            
            // Fetch all leads to find adjacent ones
            const response = await adminCrmLeadsApi({ 
                params: { 
                    page: 1, 
                    limit: 1000, // Get enough leads to find adjacent ones
                    sortBy: 'createdAt',
                    sortOrder: 'desc'
                } 
            });
            
            if (response.success) {
                // Handle both response.leads and response.data.leads
                const leads = response.leads || response.data?.leads || [];
                const currentIndex = leads.findIndex(l => l._id === leadId || l._id?.toString() === leadId?.toString());
                
                if (currentIndex >= 0) {
                    const prevLead = currentIndex > 0 ? leads[currentIndex - 1] : null;
                    const nextLead = currentIndex < leads.length - 1 ? leads[currentIndex + 1] : null;
                    
                    setAdjacentLeads({
                        prev: prevLead ? { 
                            id: prevLead._id, 
                            name: `${prevLead.firstName || ''} ${prevLead.lastName || ''}`.trim() || 'Unnamed Lead'
                        } : null,
                        next: nextLead ? { 
                            id: nextLead._id, 
                            name: `${nextLead.firstName || ''} ${nextLead.lastName || ''}`.trim() || 'Unnamed Lead'
                        } : null
                    });
                } else {
                    // If current lead not found, still try to set adjacent leads
                    console.warn('Current lead not found in list, attempting to find by ID');
                    setAdjacentLeads({ prev: null, next: null });
                }
            } else {
                console.error('Failed to fetch leads for navigation:', response);
                setAdjacentLeads({ prev: null, next: null });
            }
        } catch (error) {
            console.error('Error fetching adjacent leads:', error);
            setAdjacentLeads({ prev: null, next: null });
        } finally {
            setLoadingNavigation(false);
        }
    }, [leadId]);

    useEffect(() => {
        let mounted = true;
        let interval;

        const initializePage = async () => {
            // Always fetch data, don't wait for permissions
            await fetchLeadData();
            
            if (mounted) {
                // Start auto-refresh interval
                interval = setInterval(() => {
                    fetchLeadData(true);
                }, 30000);
            }
        };

        initializePage();

        return () => {
            mounted = false;
            if (interval) clearInterval(interval);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leadId]);

    // Note: Record-level authorization is handled by backend
    // Backend returns 403 if user doesn't have access to this specific lead

    const handleAddComment = async () => {
        if (!newComment.trim()) {
            toast.warning('Please enter a comment');
            return;
        }

        try {
            setSubmittingComment(true);
            const response = await addLeadCommentApi(leadId, newComment.trim());

            if (response.success) {
                toast.success('Comment added successfully');
                setNewComment('');
                fetchLeadData(true);
            } else {
                toast.error(response.message || 'Failed to add comment');
            }
        } catch (error) {
            console.error('Error adding comment:', error);
            toast.error('Error adding comment');
        } finally {
            setSubmittingComment(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAddComment();
        }
    };

    const handleEditToggle = (field) => {
        setEditMode(prev => ({ ...prev, [field]: !prev[field] }));
    };

    const handleEditChange = (field, value) => {
        setEditValues(prev => ({ ...prev, [field]: value }));
    };

    const handleSaveField = async (field) => {
        try {
            setSaving(prev => ({ ...prev, [field]: true }));
            
            const response = await updateLeadApi(leadId, editValues);

            if (response.success) {
                toast.success(`${field} updated successfully`);
                setEditMode(prev => ({ ...prev, [field]: false }));
                fetchLeadData(true);
            } else {
                toast.error(response.msg || 'Failed to update');
            }
        } catch (error) {
            console.error('Error updating field:', error);
            toast.error('Error updating field');
        } finally {
            setSaving(prev => ({ ...prev, [field]: false }));
        }
    };

    const handleCancelEdit = (field) => {
        setEditValues(prev => ({ ...prev, [field]: lead[field] || '' }));
        setEditMode(prev => ({ ...prev, [field]: false }));
    };

    const handleInlineStatusChange = useCallback(async (leadRecord, newStatus) => {
        if (!leadRecord?._id || !newStatus || newStatus === leadRecord.status) {
            return;
        }

        setUpdatingLeadStatus(true);
        try {
            const response = await updateLeadApi(leadRecord._id, {
                firstName: leadRecord.firstName,
                lastName: leadRecord.lastName,
                email: leadRecord.email,
                phone: leadRecord.phone,
                country: leadRecord.country,
                Brand: leadRecord.Brand,
                Address: leadRecord.Address,
                status: newStatus,
                remarks: leadRecord.remarks,
            });

            if (response.success) {
                setLead((prev) => (prev ? { ...prev, status: newStatus } : prev));
                setEditValues((prev) => ({ ...prev, status: newStatus }));
                toast.success('Status updated');
                fetchLeadData(true);
            } else {
                toast.error(response.msg || 'Failed to update status');
            }
        } catch (error) {
            console.error('Error updating lead status:', error);
            toast.error(error?.msg || 'Failed to update status');
        } finally {
            setUpdatingLeadStatus(false);
        }
    }, [fetchLeadData]);

    // ===========================
    // ✅ NEW: COMMENT FEATURE HANDLERS
    // ===========================

    // Comment Menu Handlers
    const handleCommentMenuOpen = (event, comment) => {
        setCommentMenuAnchor(event.currentTarget);
        setSelectedComment(comment);
    };

    const handleCommentMenuClose = () => {
        setCommentMenuAnchor(null);
    };

    // Edit Comment
    const handleEditCommentClick = () => {
        setEditCommentContent(selectedComment.comment || '');
        setEditCommentReason('');
        setEditCommentDialogOpen(true);
        handleCommentMenuClose();
    };

    const handleEditCommentSubmit = async () => {
        if (!editCommentContent.trim()) {
            toast.warning('Comment content cannot be empty');
            return;
        }

        try {
            setEditingComment(true);
            const response = await editCommentApi(
                leadId, 
                selectedComment._id, 
                editCommentContent.trim(),
                editCommentReason.trim()
            );

            if (response.success) {
                toast.success('Comment edited successfully');
                setEditCommentDialogOpen(false);
                setEditCommentContent('');
                setEditCommentReason('');
                fetchLeadData(true);
            } else {
                toast.error(response.message || 'Failed to edit comment');
            }
        } catch (error) {
            console.error('Error editing comment:', error);
            toast.error('Error editing comment');
        } finally {
            setEditingComment(false);
        }
    };

    // Delete Comment
    const handleDeleteCommentClick = () => {
        setDeleteConfirmOpen(true);
        handleCommentMenuClose();
    };

    const handleDeleteCommentConfirm = async () => {
        try {
            setDeletingComment(true);
            const response = await deleteCommentApi(leadId, selectedComment._id);

            if (response.success) {
                toast.success('Comment deleted successfully');
                setDeleteConfirmOpen(false);
                setSelectedComment(null);
                fetchLeadData(true);
            } else {
                toast.error(response.message || 'Failed to delete comment');
            }
        } catch (error) {
            console.error('Error deleting comment:', error);
            toast.error('Error deleting comment');
        } finally {
            setDeletingComment(false);
        }
    };

    // Like/Unlike
    const handleToggleLike = async (comment, event) => {
        event.stopPropagation();
        try {
            const response = await toggleLikeCommentApi(leadId, comment._id);
            if (response.success) {
                // Update the comment in local state
                setActivities(prev => prev.map(activity => 
                    activity._id === comment._id 
                        ? { ...activity, likes: response.likes }
                        : activity
                ));
            } else {
                toast.error(response.message || 'Failed to toggle like');
            }
        } catch (error) {
            console.error('Error toggling like:', error);
            toast.error('Error liking comment');
        }
    };

    // Pin/Unpin
    const handleTogglePin = async () => {
        try {
            const response = await togglePinCommentApi(leadId, selectedComment._id);
            if (response.success) {
                toast.success(response.message);
                handleCommentMenuClose();
                fetchLeadData(true);
            } else {
                toast.error(response.message || 'Failed to toggle pin');
            }
        } catch (error) {
            console.error('Error toggling pin:', error);
            toast.error('Error pinning comment');
        }
    };

    // Mark Important
    const handleToggleImportant = async () => {
        try {
            const response = await toggleImportantCommentApi(leadId, selectedComment._id);
            if (response.success) {
                toast.success(response.message);
                handleCommentMenuClose();
                fetchLeadData(true);
            } else {
                toast.error(response.message || 'Failed to toggle importance');
            }
        } catch (error) {
            console.error('Error toggling importance:', error);
            toast.error('Error marking comment');
        }
    };

    // View Edit History
    const handleViewHistory = async () => {
        try {
            setLoadingHistory(true);
            setHistoryDialogOpen(true);
            handleCommentMenuClose();
            
            const response = await getCommentHistoryApi(leadId, selectedComment._id);
            if (response.success) {
                setCommentHistory(response.history || []);
            } else {
                toast.error('Failed to load edit history');
            }
        } catch (error) {
            console.error('Error loading history:', error);
            toast.error('Error loading edit history');
        } finally {
            setLoadingHistory(false);
        }
    };

    // Quote Reply
    const handleQuoteReplyClick = () => {
        setQuoteReplyContent('');
        setQuoteReplyDialogOpen(true);
        handleCommentMenuClose();
    };

    const handleQuoteReplySubmit = async () => {
        if (!quoteReplyContent.trim()) {
            toast.warning('Reply content cannot be empty');
            return;
        }

        try {
            setAddingQuoteReply(true);
            const response = await addQuoteReplyApi(
                leadId, 
                selectedComment._id, 
                quoteReplyContent.trim()
            );

            if (response.success) {
                toast.success('Quote reply added successfully');
                setQuoteReplyDialogOpen(false);
                setQuoteReplyContent('');
                setSelectedComment(null);
                
                // Refresh main data to show the new quote reply
                await fetchLeadData(true);
            } else {
                toast.error(response.message || 'Failed to add quote reply');
            }
        } catch (error) {
            console.error('Error adding quote reply:', error);
            toast.error('Error adding quote reply');
        } finally {
            setAddingQuoteReply(false);
        }
    };

    // Nested Reply
    const handleNestedReplyClick = () => {
        setNestedReplyContent('');
        setNestedReplyDialogOpen(true);
        handleCommentMenuClose();
    };

    const handleNestedReplySubmit = async () => {
        if (!nestedReplyContent.trim()) {
            toast.warning('Reply content cannot be empty');
            return;
        }

        try {
            setAddingNestedReply(true);
            const parentCommentId = selectedComment._id;
            const parentIsNested = selectedComment.parentCommentId; // Check if replying to a nested reply
            const topLevelParentId = parentIsNested || parentCommentId; // Get the top-level parent
            
            const response = await addNestedReplyApi(
                leadId, 
                parentCommentId, 
                nestedReplyContent.trim()
            );

            if (response.success) {
                toast.success('Reply added successfully');
                setNestedReplyDialogOpen(false);
                setNestedReplyContent('');
                
                // ✅ CRITICAL FIX: Reload the TOP-LEVEL parent's replies tree
                
                // Step 1: Refresh main data
                await fetchLeadData(true);
                
                // Step 2: Auto-expand the TOP-LEVEL parent comment (not nested parent)
                const newExpanded = new Set(expandedReplies);
                newExpanded.add(topLevelParentId);
                setExpandedReplies(newExpanded);
                
                // Step 3: Reload ALL nested replies for the TOP-LEVEL parent
                try {
                    setLoadingReplies(prev => ({ ...prev, [topLevelParentId]: true }));
                    const repliesResponse = await getNestedRepliesApi(leadId, topLevelParentId);
                    if (repliesResponse.success) {setNestedReplies(prev => ({
                            ...prev,
                            [topLevelParentId]: repliesResponse.replies || []
                        }));
                    }
                } catch (err) {
                    console.error('Error reloading replies:', err);
                } finally {
                    setLoadingReplies(prev => ({ ...prev, [topLevelParentId]: false }));
                }
            } else {
                toast.error(response.message || 'Failed to add reply');
            }
        } catch (error) {
            console.error('Error adding nested reply:', error);
            toast.error('Error adding reply');
        } finally {
            setAddingNestedReply(false);
        }
    };

    // Toggle Nested Replies
    const handleToggleReplies = async (commentId) => {
        const newExpanded = new Set(expandedReplies);
        if (newExpanded.has(commentId)) {
            newExpanded.delete(commentId);
            setExpandedReplies(newExpanded);
        } else {
            newExpanded.add(commentId);
            setExpandedReplies(newExpanded);
            
            // Load replies if not already loaded
            if (!nestedReplies[commentId]) {
                try {
                    setLoadingReplies(prev => ({ ...prev, [commentId]: true }));
                    const response = await getNestedRepliesApi(leadId, commentId);
                    if (response.success) {
                        setNestedReplies(prev => ({
                            ...prev,
                            [commentId]: response.replies || []
                        }));
                    }
                } catch (error) {
                    console.error('Error loading replies:', error);
                    toast.error('Error loading replies');
                } finally {
                    setLoadingReplies(prev => ({ ...prev, [commentId]: false }));
                }
            }
        }
    };

    // Comment Search
    const handleSearchComments = async () => {
        if (!commentSearch.trim()) {
            setShowSearchResults(false);
            setSearchResults([]);
            return;
        }

        try {
            setSearching(true);
            const response = await searchCommentsApi(leadId, { query: commentSearch.trim() });
            if (response.success) {
                setSearchResults(response.results || []);
                setShowSearchResults(true);
                toast.success(`Found ${response.count} matching comment(s)`);
            } else {
                toast.error('Search failed');
            }
        } catch (error) {
            console.error('Error searching comments:', error);
            toast.error('Error searching comments');
        } finally {
            setSearching(false);
        }
    };

    const handleClearSearch = () => {
        setCommentSearch('');
        setSearchResults([]);
        setShowSearchResults(false);
    };

    // Show Likes Dialog
    const handleShowLikes = (comment) => {
        setSelectedLikes(comment.likes || []);
        setLikesDialogOpen(true);
        handleCommentMenuClose();
    };

    // Check if user can delete a comment
    const canDeleteComment = useCallback((comment) => {
        if (!currentUserLatest) return false;
        const userRole = currentUserLatest.role;
        const userId = currentUserLatest._id;
        const authorId = comment.createdBy?.userId;
        const authorRole = comment.createdBy?.userRole;

        // Superadmin can delete all
        if (userRole === 'superadmin') return true;
        
        // Admin can delete subadmin and own
        if (userRole === 'admin') {
            if (userId === authorId) return true;
            if (authorRole === 'subadmin') return true;
            return false;
        }
        
        // Subadmin can delete only own
        if (userRole === 'subadmin') {
            return userId === authorId;
        }
        
        return false;
    }, [currentUserLatest]);

    // Check if user can edit a comment
    const canEditComment = useCallback((comment) => {
        if (!currentUserLatest) return false;
        const userId = currentUserLatest._id;
        const authorId = comment.createdBy?.userId;
        
        // Only author can edit
        return userId === authorId && comment.type === 'comment';
    }, [currentUserLatest]);

    // Check if user can pin
    const canPinComment = useCallback(() => {
        if (!currentUserLatest) return false;
        return currentUserLatest.role === 'superadmin' || currentUserLatest.role === 'admin';
    }, [currentUserLatest]);

    // Check if user liked a comment
    const hasUserLiked = useCallback((comment) => {
        if (!currentUserLatest) return false;
        return comment.likes?.some(like => like.userId === currentUserLatest._id) || false;
    }, [currentUserLatest]);

    // Fetch call history
    const fetchCallHistory = useCallback(async () => {
        if (!leadId) return;
        
        try {
            setLoadingCallHistory(true);
            const response = await getCallHistoryApi(leadId);
            
            if (response.success) {
                setCallHistory(response.calls || []);
            } else {
                toast.error(response.message || 'Failed to load call history');
            }
        } catch (error) {
            console.error('Error fetching call history:', error);
            toast.error('Error loading call history');
        } finally {
            setLoadingCallHistory(false);
        }
    }, [leadId]);

    // Initiate call
    const handleInitiateCall = async () => {
        if (!canMakeCalls) {
            toast.error('You do not have permission to make calls');
            return;
        }
        if (!lead.phone) {
            toast.error('Lead does not have a phone number');
            return;
        }

        try {
            setCallingLead(true);
            const response = await initiateCallApi(leadId, lead.phone);
            
            if (response.success) {
                toast.success('Call initiated successfully');
                setActiveCallSessionId(response.call.sessionId);
                setCurrentCallStatus('initiating'); // Set initial status
                console.log('Call initiated in LeadStream, sessionId:', response.call.sessionId);
                // Refresh call history after a short delay
                setTimeout(() => {
                    fetchCallHistory();
                }, 2000);
            } else {
                // Check if it's a Vapi config error
                if (response.requiresVapiConfig || response.msg?.includes('Vapi API key')) {
                    toast.error(response.msg || response.message || 'Vapi API key is not configured. Please configure your Vapi settings in your profile before making calls.');
                } else {
                    toast.error(response.msg || response.message || 'Failed to initiate call');
                }
            }
        } catch (error) {
            console.error('Error initiating call:', error);
            // Check if it's a Vapi config error
            if (error.response?.data?.requiresVapiConfig || error.response?.data?.msg?.includes('Vapi API key')) {
                toast.error(error.response?.data?.msg || error.response?.data?.message || 'Vapi API key is not configured. Please configure your Vapi settings in your profile before making calls.');
            } else {
                toast.error(error.response?.data?.msg || error.response?.data?.message || 'Error initiating call');
            }
        } finally {
            setCallingLead(false);
        }
    };

    // Cancel call
    const handleCancelCall = async (sessionId) => {
        try {
            const response = await cancelCallApi(sessionId);
            
            if (response.success) {
                toast.success('Call cancelled');
                setActiveCallSessionId(null);
                fetchCallHistory();
            } else {
                toast.error(response.message || 'Failed to cancel call');
            }
        } catch (error) {
            console.error('Error cancelling call:', error);
            toast.error('Error cancelling call');
        }
    };

    const [deletingCall, setDeletingCall] = useState(null);
    const [deleteCallConfirm, setDeleteCallConfirm] = useState(null);

    const handleDeleteCall = async (callId) => {
        try {
            setDeletingCall(callId);
            const response = await deleteCallApi(callId);
            if (response.success) {
                toast.success(response.message || 'Call deleted successfully');
                fetchCallHistory();
                setCallHistory(prev => prev.filter(c => c._id !== callId));
            } else {
                toast.error(response.message || 'Failed to delete call');
            }
        } catch (error) {
            console.error('Error deleting call:', error);
            toast.error(error.response?.data?.msg || 'Failed to delete call');
        } finally {
            setDeletingCall(null);
            setDeleteCallConfirm(null);
        }
    };

    const handleDeleteAllCalls = async () => {
        try {
            setDeletingCall('all');
            const response = await deleteCallHistoryApi(leadId);
            if (response.success) {
                toast.success(response.message || 'All call history deleted successfully');
                fetchCallHistory();
                setCallHistory([]);
            } else {
                toast.error(response.message || 'Failed to delete call history');
            }
        } catch (error) {
            console.error('Error deleting call history:', error);
            toast.error(error.response?.data?.msg || 'Failed to delete call history');
        } finally {
            setDeletingCall(null);
            setDeleteCallConfirm(null);
        }
    };

    // Format duration helper
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

    // Get status color
    const getCallStatusColor = (status) => {
        switch (status) {
            case 'completed': return 'success';
            case 'in-progress': return 'info';
            case 'ringing': return 'warning';
            case 'failed': return 'error';
            case 'no-answer': return 'default';
            case 'cancelled': return 'default';
            default: return 'default';
        }
    };

    // Get status icon
    const getCallStatusIcon = (status) => {
        switch (status) {
            case 'completed': return <CheckCircle />;
            case 'in-progress': return <PhoneInTalk />;
            case 'ringing': return <PhoneCallback />;
            case 'failed': return <Cancel />;
            case 'no-answer': return <PhoneDisabled />;
            case 'cancelled': return <Stop />;
            default: return <Schedule />;
        }
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

    // Export transcript as text file
    const exportTranscript = (call, format = 'txt') => {
        if (!call.transcript) {
            toast.error('No transcript available for this call');
            return;
        }

        try {
            let content = '';
            let filename = '';

            // Parse transcript
            let messages = [];
            try {
                const parsed = JSON.parse(call.transcript);
                if (Array.isArray(parsed)) {
                    messages = parsed;
                }
            } catch (e) {
                // Not JSON, parse text format
                const lines = call.transcript.split('\n').filter(line => line.trim());
                for (const line of lines) {
                    const userMatch = line.match(/^(User|Customer|Caller):\s*(.+)/i);
                    const botMatch = line.match(/^(Bot|Assistant|AI|Agent):\s*(.+)/i);
                    if (userMatch) {
                        messages.push({ role: 'user', content: userMatch[2].trim() });
                    } else if (botMatch) {
                        messages.push({ role: 'bot', content: botMatch[2].trim() });
                    }
                }
            }

            // Build content
            content = `CALL TRANSCRIPT\n`;
            content += `${'='.repeat(60)}\n\n`;
            content += `Lead: ${lead?.firstName || ''} ${lead?.lastName || ''}\n`;
            content += `Phone: ${call.phoneNumber}\n`;
            content += `Date: ${formatDateTime(call.createdAt || call.startedAt)}\n`;
            content += `Duration: ${formatDuration(call.duration)}\n`;
            content += `Status: ${call.status}\n\n`;
            
            if (call.summary) {
                content += `CALL SUMMARY\n`;
                content += `${'-'.repeat(60)}\n`;
                content += `${call.summary}\n\n`;
            }

            content += `CONVERSATION TRANSCRIPT\n`;
            content += `${'-'.repeat(60)}\n\n`;

            if (messages.length > 0) {
                messages.forEach((msg, idx) => {
                    const role = msg.role === 'user' ? 'USER' : 'BOT';
                    const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
                    content += `[${role}${timestamp ? ` - ${timestamp}` : ''}]\n`;
                    content += `${msg.content || msg.text || msg.message}\n\n`;
                });
            } else {
                content += call.transcript;
            }

            // Add SIP events if available
            if (call.metadata?.sipEvents && call.metadata.sipEvents.length > 0) {
                content += `\nSIP EVENTS TIMELINE\n`;
                content += `${'-'.repeat(60)}\n`;
                call.metadata.sipEvents.forEach((event, idx) => {
                    const timestamp = event.timestamp ? new Date(event.timestamp).toLocaleString() : 'N/A';
                    content += `${idx + 1}. SIP ${event.code} ${event.message} - ${timestamp}\n`;
                });
            }

            // Create and download file
            filename = `call_transcript_${call.phoneNumber}_${new Date(call.createdAt || call.startedAt).toISOString().split('T')[0]}.txt`;
            const blob = new Blob([content], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            toast.success('Transcript exported successfully');
        } catch (error) {
            console.error('Error exporting transcript:', error);
            toast.error('Failed to export transcript');
        }
    };

    // Parse conversation transcript to display bot and user messages separately
    const parseConversationTranscript = (transcript) => {
        if (!transcript) return null;

        // Try to parse if it's JSON (structured format)
        try {
            const parsed = JSON.parse(transcript);
            if (Array.isArray(parsed) && parsed.length > 0) {
                // If it's an array of message objects
                return (
                    <Stack spacing={1.5}>
                        {parsed.map((msg, idx) => (
                            <Box
                                key={idx}
                                sx={{
                                    display: 'flex',
                                    flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                                    gap: 1,
                                    mb: 1
                                }}
                            >
                                <Box
                                    sx={{
                                        maxWidth: '75%',
                                        p: 1.5,
                                        borderRadius: 2,
                                        bgcolor: msg.role === 'user' 
                                            ? 'primary.main' 
                                            : (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'grey.100',
                                        color: msg.role === 'user' 
                                            ? 'white' 
                                            : 'text.primary',
                                        boxShadow: 1
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                                        {msg.role === 'user' ? (
                                            <PersonIcon sx={{ fontSize: 16 }} />
                                        ) : (
                                            <SmartToy sx={{ fontSize: 16 }} />
                                        )}
                                        <Typography variant="caption" sx={{ fontWeight: 600, opacity: 0.9 }}>
                                            {msg.role === 'user' ? 'User' : 'Bot'}
                                        </Typography>
                                        {msg.timestamp && (
                                            <Typography variant="caption" sx={{ ml: 'auto', opacity: 0.7 }}>
                                                {new Date(msg.timestamp).toLocaleTimeString()}
                                            </Typography>
                                        )}
                                    </Box>
                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                        {msg.content || msg.text || msg.message}
                                    </Typography>
                                </Box>
                            </Box>
                        ))}
                    </Stack>
                );
            }
        } catch (e) {
            // Not JSON, try to parse text format
        }

        // Try to parse text format like "User: ... Bot: ..."
        const lines = transcript.split('\n').filter(line => line.trim());
        const messages = [];
        
        let currentRole = null;
        let currentContent = [];
        
        for (const line of lines) {
            const userMatch = line.match(/^(User|Customer|Caller):\s*(.+)/i);
            const botMatch = line.match(/^(Bot|Assistant|AI|Agent):\s*(.+)/i);
            
            if (userMatch) {
                // Save previous message if exists
                if (currentRole && currentContent.length > 0) {
                    messages.push({
                        role: currentRole,
                        content: currentContent.join(' ').trim()
                    });
                }
                currentRole = 'user';
                currentContent = [userMatch[2].trim()];
            } else if (botMatch) {
                // Save previous message if exists
                if (currentRole && currentContent.length > 0) {
                    messages.push({
                        role: currentRole,
                        content: currentContent.join(' ').trim()
                    });
                }
                currentRole = 'bot';
                currentContent = [botMatch[2].trim()];
            } else if (currentRole && line.trim()) {
                // Continue current message
                currentContent.push(line.trim());
            }
        }
        
        // Add last message
        if (currentRole && currentContent.length > 0) {
            messages.push({
                role: currentRole,
                content: currentContent.join(' ').trim()
            });
        }

        // If we found structured messages, display them
        if (messages.length > 0) {
            return (
                <Stack spacing={1.5}>
                    {messages.map((msg, idx) => (
                        <Box
                            key={idx}
                            sx={{
                                display: 'flex',
                                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                                gap: 1,
                                mb: 1
                            }}
                        >
                            <Box
                                sx={{
                                    maxWidth: '75%',
                                    p: 1.5,
                                    borderRadius: 2,
                                    bgcolor: msg.role === 'user' 
                                        ? 'primary.main' 
                                        : 'background.default',
                                    color: msg.role === 'user' 
                                        ? 'primary.contrastText' 
                                        : 'text.primary',
                                    boxShadow: 1
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                                    {msg.role === 'user' ? (
                                        <PersonIcon sx={{ fontSize: 16 }} />
                                    ) : (
                                        <SmartToy sx={{ fontSize: 16 }} />
                                    )}
                                    <Typography variant="caption" sx={{ fontWeight: 600, opacity: 0.9 }}>
                                        {msg.role === 'user' ? 'User' : 'Bot'}
                                    </Typography>
                                </Box>
                                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                    {msg.content}
                                </Typography>
                            </Box>
                        </Box>
                    ))}
                </Stack>
            );
        }

        // Fallback: display as plain text
        return (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontFamily: 'monospace', fontSize: '0.875rem' }}>
                {transcript}
            </Typography>
        );
    };

    // Fetch call history when Call History tab is selected
    useEffect(() => {
        if (currentTab === 0) { // Call History tab index (first tab)
            fetchCallHistory();
        }
    }, [currentTab, fetchCallHistory]);

    // ✅ Use SSE for real-time call status updates
    useEffect(() => {
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';
        
        // Parse URL properly to avoid malformed URLs
        let backendUrl;
        try {
            const url = new URL(apiUrl);
            backendUrl = `${url.protocol}//${url.host}`;
        } catch (e) {
            console.error('Invalid REACT_APP_API_URL:', apiUrl);
            // Use production API if localhost fails
            backendUrl = window.location.hostname === 'localhost' 
                ? 'http://localhost:4000' 
                : 'https://api.vocaledge.io';
        }
        
        // If still localhost but not running locally, use production
        if (backendUrl.includes('localhost') && window.location.hostname !== 'localhost') {
            backendUrl = 'https://api.vocaledge.io';
        }
        
        console.log('🔌 [LEADSTREAM] Using backend URL for SSE:', backendUrl);
        
        // Connect to SSE endpoint (async)
        sseClient.connect(`${backendUrl}/api/v1/crm/call/updates/sse`).catch(err => {
            console.error('❌ [LEADSTREAM] Failed to connect SSE:', err);
        });
        
        // Listen for call status updates
        const unsubscribe = sseClient.on('call:status:update', (data) => {
            console.log('═══════════════════════════════════════════════════════════');
            console.log('📞 [LEADSTREAM] Socket call:status:update received:');
            console.log('  📦 Raw Data:', JSON.stringify(data, null, 2));
            console.log('  📋 Status:', data.status);
            console.log('  🔢 SIP Code:', data.sipStatus?.code);
            console.log('  📝 SIP Message:', data.sipStatus?.message);
            console.log('  👤 Lead ID:', data.leadId);
            console.log('  🆔 Session ID:', data.sessionId);
            console.log('═══════════════════════════════════════════════════════════');
            
            const dataLeadId = data.leadId?._id || data.leadId || null;
            const dataSessionId = data.sessionId || null;
            
            // Check if this update is for the current lead
            const isForCurrentLead = dataLeadId && String(dataLeadId) === String(leadId);
            
            console.log('🔍 [LEADSTREAM] Matching:', {
                dataLeadId,
                currentLeadId: leadId,
                dataSessionId,
                activeCallSessionId,
                isForCurrentLead,
                status: data.status
            });
            
            if (isForCurrentLead && lead) {
                // Update current call status if sessionId matches or if we don't have an active session yet
                if (dataSessionId === activeCallSessionId || (!activeCallSessionId && dataSessionId)) {
                    // Map SIP codes to status - SIP codes take priority
                    const mappedStatus = mapSipEventsToStatus(
                        data.status,
                        data.metadata?.sipEvents,
                        data.metadata?.sipStatus
                    );
                    
                    // Use explicit terminal status if provided (always override)
                    if (data.status && (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled')) {
                        mappedStatus = data.status;
                        console.log('  🔒 [LEADSTREAM] Terminal status override:', mappedStatus);
                    }
                    
                    console.log('  📍 [LEADSTREAM] Final mapped status:', mappedStatus, '(original:', data.status, ', SIP:', data.sipStatus?.code, ')');
                    
                    if (mappedStatus) {
                        setCurrentCallStatus(mappedStatus);
                        console.log('✅ [LEADSTREAM] Updated current call status:', mappedStatus);
                        
                        // Update activeCallSessionId if we don't have one yet
                        if (!activeCallSessionId && dataSessionId) {
                            setActiveCallSessionId(dataSessionId);
                            console.log('✅ [LEADSTREAM] Set activeCallSessionId:', dataSessionId);
                        }
                        
                        // Update call history
                setCallHistory(prev => {
                            const existingIndex = prev.findIndex(c => c.sessionId === dataSessionId || c._id === data.callId);
                    if (existingIndex >= 0) {
                        const updated = [...prev];
                        const existingCall = updated[existingIndex];
                        
                                // Update SIP events
                        let sipEvents = existingCall.metadata?.sipEvents || [];
                                if (data.sipStatus?.code) {
                            const eventExists = sipEvents.some(e => 
                                e.code === data.sipStatus.code && 
                                e.message === data.sipStatus.message
                            );
                            if (!eventExists) {
                                sipEvents = [...sipEvents, {
                                    code: data.sipStatus.code,
                                    message: data.sipStatus.message,
                                            timestamp: data.sipStatus.timestamp || new Date(),
                                    type: data.sipStatus.type || 'unknown'
                                }];
                            }
                        }
                        
                        updated[existingIndex] = {
                            ...existingCall,
                                    status: mappedStatus || existingCall.status,
                                    duration: data.duration !== undefined ? data.duration : existingCall.duration,
                                    activeCallTime: data.activeCallTime !== undefined ? data.activeCallTime : existingCall.activeCallTime,
                                    ringingTime: data.ringingTime !== undefined ? data.ringingTime : existingCall.ringingTime,
                            startedAt: data.startedAt || existingCall.startedAt,
                            endedAt: data.endedAt || existingCall.endedAt,
                            metadata: {
                                ...existingCall.metadata,
                                sipStatus: data.sipStatus || existingCall.metadata?.sipStatus,
                                sipEvents: sipEvents
                            }
                        };
                                
                        return updated;
                            }
                            return prev;
                        });
                        
                        // Clear status when call ends
                        if (mappedStatus === 'completed' || mappedStatus === 'failed' || mappedStatus === 'cancelled') {
                            setTimeout(() => {
                                setCurrentCallStatus(null);
                                setActiveCallSessionId(null);
                                console.log('🧹 [LEADSTREAM] Cleared current call status - call ended');
                                // Refresh call history to get summary
                                fetchCallHistory();
                                toast.success('Call completed successfully');
                            }, 2000);
                        } else if (mappedStatus === 'in-progress') {
                    // Auto-switch to Call History tab when call becomes active
                            setCurrentTab(prevTab => {
                                if (prevTab !== 0) {
                                    return 0;
                                }
                                return prevTab;
                            });
                        }
                    }
                }
            }
        });

        return () => {
            sseClient.disconnect();
            unsubscribe();
            console.log('🛑 [LEADSTREAM] SSE disconnected on cleanup');
        };
    }, [leadId, activeCallSessionId]); // Only depend on leadId to avoid infinite loops

    // ✅ Polling for active calls status updates (like CallDashboard.jsx)
    useEffect(() => {
        if (!leadId) return;
        
        const fetchActiveCallsStatus = async () => {
            try {
                const response = await getActiveCallsApi();
                if (response.success && response.calls) {
                    console.log('📞 [LEADSTREAM] Active calls received from polling:', response.calls.length);
                    
                    // Find calls for the current lead
                    const currentLeadCalls = response.calls.filter(call => {
                        const callLeadId = call.leadId?._id || call.leadId;
                        return callLeadId && String(callLeadId) === String(leadId);
                    });
                    
                    if (currentLeadCalls.length > 0) {
                        // Use the most recent call for this lead
                        const currentCall = currentLeadCalls[0];
                        const originalStatus = currentCall.status;
                        let mappedStatus = originalStatus;
                        
                        // Map status based on SIP codes if available (same logic as CallDashboard)
                        if (currentCall.metadata?.sipStatus) {
                            const sipCode = currentCall.metadata.sipStatus.code;
                            if (sipCode === 100) {
                                mappedStatus = 'initiating';
                            } else if (sipCode === 180 || sipCode === 183) {
                                mappedStatus = 'ringing';
                            } else if (sipCode === 200) {
                                // 200 OK can mean two things:
                                // 1. Call answered (response to INVITE with SDP) - should be 'in-progress'
                                // 2. Call termination confirmed (response to BYE) - should be 'completed'
                                if (originalStatus === 'completed' || originalStatus === 'failed') {
                                    mappedStatus = originalStatus;
                                } else {
                                    // Call answered - set to in-progress (THIS IS THE KEY FIX)
                                    mappedStatus = 'in-progress';
                                }
                            } else if (sipCode === 'BYE') {
                                mappedStatus = 'completed';
                            }
                        }
                        
                        // Use explicit terminal status if provided (always override)
                        if (originalStatus && (originalStatus === 'completed' || originalStatus === 'failed' || originalStatus === 'cancelled')) {
                            mappedStatus = originalStatus;
                        }
                        
                        console.log('📞 [LEADSTREAM] Call status mapping from polling:', {
                            leadId,
                            sessionId: currentCall.sessionId,
                            phoneNumber: currentCall.phoneNumber,
                            originalStatus,
                            mappedStatus,
                            sipCode: currentCall.metadata?.sipStatus?.code,
                            sipMessage: currentCall.metadata?.sipStatus?.message
                        });
                        
                        // Update current call status
                        setCurrentCallStatus(mappedStatus);
                        
                        // Update activeCallSessionId if we don't have one yet
                        if (!activeCallSessionId && currentCall.sessionId) {
                            setActiveCallSessionId(currentCall.sessionId);
                        }
                        
                        // Clear status if call is completed/failed/cancelled
                        if (mappedStatus === 'completed' || mappedStatus === 'failed' || mappedStatus === 'cancelled') {
                            setTimeout(() => {
                                setCurrentCallStatus(null);
                                setActiveCallSessionId(null);
                            }, 2000);
                        }
                    } else {
                        // No active calls for this lead - clear status if it exists
                        if (currentCallStatus && (currentCallStatus === 'initiating' || currentCallStatus === 'ringing' || currentCallStatus === 'in-progress')) {
                            // Only clear if we don't have an active session ID to avoid clearing prematurely
                            if (!activeCallSessionId) {
                                setCurrentCallStatus(null);
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('Error fetching active calls status:', err);
            }
        };

        fetchActiveCallsStatus(); // Initial fetch
        const interval = setInterval(fetchActiveCallsStatus, 5000); // Poll every 5 seconds (same as CallDashboard)
        
        return () => clearInterval(interval);
    }, [leadId, activeCallSessionId, currentCallStatus]);

    const formatFullDateTime = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
    };

    const formatDateTime = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);

        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday = date.toDateString() === yesterday.toDateString();

        const timeStr = date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `Today ${timeStr}`;
        if (isYesterday) return `Yesterday ${timeStr}`;
        
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    };

    const getActivityTypeLabel = (type) => {
        const labels = {
            'created': 'Created',
            'comment': 'Comment',
            'status_change': 'Status Changed',
            'assignment_change': 'Agent Changed',
            'field_update': 'Updated',
            'email_sent': 'Email Sent',
            'call_logged': 'Call Logged',
            'reminder': 'Reminder',
        };
        return labels[type] || type;
    };

    const getActivityDisplayDescription = (activity) => {
        if (activity.isReminder && activity.reminder) {
            const scheduled = formatReminderDateTime(activity.reminder.reminderDateTime);
            return activity.reminder.description
                ? `${activity.reminder.description} · Scheduled for ${scheduled}`
                : `Scheduled for ${scheduled}`;
        }

        if (activity.type === 'assignment_change' && activity.changes) {
            const oldValue = activity.changes.oldValue || 'Unassigned';
            const newValue = activity.changes.newValue || 'Unassigned';
            const assignedOn = formatFullDateTime(activity.createdAt);
            return `Agent changed from '${oldValue}' to '${newValue}'. Assigned on ${assignedOn}.`;
        }

        return activity.description || activity.comment || 'No description';
    };

    const getActivityTimestamp = (activity) => {
        if (activity.isReminder && activity.reminder) {
            return `Set ${formatDateTime(activity.createdAt)} · Due ${formatReminderDateTime(activity.reminder.reminderDateTime)}`;
        }

        if (activity.type === 'assignment_change') {
            return formatFullDateTime(activity.createdAt);
        }

        return formatDateTime(activity.createdAt);
    };

    // ✅ Highlight mentions in text
    const highlightMentions = (text) => {
        if (!text) return text;
        
        // Match @FirstName LastName pattern
        const mentionPattern = /@(\w+\s+\w+)/g;
        const parts = [];
        let lastIndex = 0;
        let match;

        while ((match = mentionPattern.exec(text)) !== null) {
            // Add text before mention
            if (match.index > lastIndex) {
                parts.push(text.substring(lastIndex, match.index));
            }
            
            // Add highlighted mention
            parts.push(
                                                                        <Chip
                                                                            key={match.index}
                                                                            label={`@${match[1]}`}
                                                                            size="small"
                                                                            icon={<AlternateEmail sx={{ fontSize: 14 }} />}
                                                                            sx={{
                                                                                height: 22,
                                                                                fontSize: '0.75rem',
                                                                                fontWeight: 600,
                                                                                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(102, 126, 234, 0.2)' : 'primary.light',
                                                                                color: (theme) => theme.palette.mode === 'dark' ? 'primary.light' : 'primary.dark',
                                                                                mx: 0.5,
                                                                                verticalAlign: 'middle'
                                                                            }}
                                                                        />
            );
            
            lastIndex = match.index + match[0].length;
        }

        // Add remaining text
        if (lastIndex < text.length) {
            parts.push(text.substring(lastIndex));
        }

        return parts.length > 0 ? parts : text;
    };

    const getActivityTypeColor = (type) => {
        const colors = {
            'created': 'success',
            'comment': 'primary',
            'status_change': 'warning',
            'assignment_change': 'secondary',
            'field_update': 'info',
            'email_sent': 'info',
            'call_logged': 'default',
            'reminder': 'warning',
        };
        return colors[type] || 'default';
    };

    // Filter activities (with search results support)
    // ✅ IMPORTANT: Exclude nested replies from main stream (they appear under parent)
    const isTopLevelActivity = (activity) => {
        // Include if: no parentCommentId, parentCommentId is null, or parentCommentId is undefined
        return !activity.parentCommentId;
    };

    const streamItems = useMemo(() => {
        const activityItems = activities
            .filter(isTopLevelActivity)
            .map((activity) => ({
                ...activity,
                isReminder: false,
                streamTimestamp: activity.createdAt,
            }));

        const reminderItems = reminders.map((reminder) => ({
            _id: `reminder-${reminder._id}`,
            type: 'reminder',
            isReminder: true,
            reminder,
            createdAt: reminder.createdAt,
            streamTimestamp: reminder.createdAt,
            createdBy: {
                userName: reminder.ownerName || 'Unknown User',
                userRole: reminder.ownerRole || 'admin',
            },
        }));

        return [...activityItems, ...reminderItems].sort(
            (a, b) => new Date(b.streamTimestamp) - new Date(a.streamTimestamp)
        );
    }, [activities, reminders]);
    
    const filteredStreamItems = showSearchResults 
        ? searchResults 
        : activityFilter === 'all' 
            ? streamItems
            : activityFilter === 'reminder'
                ? streamItems.filter((item) => item.isReminder)
                : streamItems.filter((a) => !a.isReminder && a.type === activityFilter && isTopLevelActivity(a));

    const reminderStatusColor = {
        pending: 'warning',
        completed: 'success',
        dismissed: 'default',
    };

    // Editable fields use LeadEditableField (stable module component — avoids remounting manage dialog)

    if (loading && !lead) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: 'background.default' }}>
                <CircularProgress size={48} />
            </Box>
        );
    }

    if (!loading && !lead) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: 'background.default' }}>
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <Typography variant="h6" color="error" gutterBottom>Lead not found</Typography>
                    <Button variant="contained" onClick={() => navigate('/admin/dashboard/crm')} sx={{ mt: 2 }}>
                        Back to Leads
                    </Button>
                </Paper>
            </Box>
        );
    }

    return (
        <Box sx={{ display: 'block', minHeight: '100vh', bgcolor: 'background.default' }}>
            <Sidebar
                setisMobileMenu={setIsMobileMenu}
                isMobileMenu={isMobileMenu}
                isCollapsed={isSidebarCollapsed}
                setIsSidebarCollapsed={setIsSidebarCollapsed}
            />

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

            <Box
                component="main"
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    ml: {
                        xs: 0,
                        md: isSidebarCollapsed ? '80px' : '280px',
                    },
                    transition: 'margin-left 0.3s ease',
                    height: '100vh',
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <AppBar
                    position="static"
                    elevation={0}
                    sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}
                >
                    <Toolbar>
                        <IconButton
                            onClick={() => setIsMobileMenu(!isMobileMenu)}
                            size="small"
                            edge="start"
                            sx={{
                                color: 'text.primary',
                                display: { xs: 'block', md: 'none' },
                                mr: 1
                            }}
                        >
                            <MenuIcon />
                        </IconButton>
                        <IconButton
                            onClick={() => navigate('/admin/dashboard/crm')}
                            sx={{ mr: 2, color: 'text.primary' }}
                        >
                            <ArrowBack />
                        </IconButton>
                        
                        <Box sx={{ flex: 1 }}>
                            <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 600 }}>
                                {lead?.firstName || ''} {lead?.lastName || ''}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Lead ID: {leadId?.slice(-8) || 'N/A'} • {totalActivities} activities
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
                            <CrmAppBarActions />
                            {/* Navigation Arrows - Moved to right side */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Tooltip title={adjacentLeads.prev ? `Previous: ${adjacentLeads.prev.name}` : 'No previous lead'}>
                                    <span>
                                        <IconButton
                                            onClick={() => {
                                                if (adjacentLeads.prev) {
                                                    navigate(`/admin/crm/lead/${adjacentLeads.prev.id}/stream`);
                                                }
                                            }}
                                            disabled={!adjacentLeads.prev || loadingNavigation}
                                            size="small"
                                            sx={{ 
                                                color: adjacentLeads.prev ? 'text.primary' : 'text.disabled',
                                                '&:hover': {
                                                    bgcolor: adjacentLeads.prev ? 'action.hover' : 'transparent'
                                                }
                                            }}
                                        >
                                            <ChevronLeft />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                                <Tooltip title={adjacentLeads.next ? `Next: ${adjacentLeads.next.name}` : 'No next lead'}>
                                    <span>
                                        <IconButton
                                            onClick={() => {
                                                if (adjacentLeads.next) {
                                                    navigate(`/admin/crm/lead/${adjacentLeads.next.id}/stream`);
                                                }
                                            }}
                                            disabled={!adjacentLeads.next || loadingNavigation}
                                            size="small"
                                            sx={{ 
                                                color: adjacentLeads.next ? 'text.primary' : 'text.disabled',
                                                '&:hover': {
                                                    bgcolor: adjacentLeads.next ? 'action.hover' : 'transparent'
                                                }
                                            }}
                                        >
                                            <ChevronRight />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                            </Box>
                            
                            {lead?.status && (
                        <Chip 
                            label={lead.status} 
                            size="small"
                            color={
                                lead.status === 'Active' ? 'success' :
                                lead.status === 'New' ? 'primary' :
                                lead.status === 'Call Back' ? 'warning' : 'default'
                            }
                                    sx={{ fontWeight: 600, display: { xs: 'none', sm: 'inline-flex' } }}
                        />
                            )}
                        </Box>
                        {canAssign && (
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<Person />}
                                onClick={() => setAssignDialogOpen(true)}
                                sx={{ 
                                    mr: 2,
                                    display: { xs: 'none', sm: 'inline-flex' },
                                    textTransform: 'none',
                                    fontWeight: 600
                                }}
                            >
                                Assign
                            </Button>
                        )}
                        <IconButton
                            onClick={() => fetchLeadData(true)}
                            disabled={refreshing}
                            sx={{ color: 'text.secondary' }}
                        >
                            {refreshing ? <CircularProgress size={20} /> : <Refresh />}
                        </IconButton>
                    </Toolbar>
                </AppBar>

                {/* Content */}
                <Box sx={{ 
                    flex: 1, 
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <Box sx={{ 
                        flex: 1,
                        overflow: 'auto',
                        p: { xs: 2, sm: 3 },
                        '&::-webkit-scrollbar': {
                            width: '10px',
                        },
                        '&::-webkit-scrollbar-track': {
                            background: 'background.default',
                            borderRadius: '5px',
                        },
                        '&::-webkit-scrollbar-thumb': {
                            background: '#bdbdbd',
                            borderRadius: '5px',
                            '&:hover': {
                                background: '#9e9e9e',
                            },
                        },
                    }}>
                        <Box sx={{ maxWidth: 1600, mx: 'auto', width: '100%' }}>
                            <Grid container spacing={3} alignItems="flex-start">
                                {/* Left Column - Lead Information */}
                                <Grid item xs={12} lg={4}>
                                    <Card elevation={1} sx={{ borderRadius: 2, position: 'sticky', top: 0 }}>
                                {/* Lead Header */}
                                <Box sx={{ 
                                    p: 3, 
                                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                    color: 'white' // Keep white for gradient background
                                }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                        <Avatar
                                            sx={{
                                                width: 56,
                                                height: 56,
                                                bgcolor: 'rgba(255,255,255,0.2)',
                                                fontSize: '1.5rem',
                                                fontWeight: 600,
                                                border: '3px solid rgba(255,255,255,0.3)'
                                            }}
                                        >
                                            {lead.firstName?.[0]}{lead.lastName?.[0]}
                                        </Avatar>
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                                {lead.firstName} {lead.lastName}
                                            </Typography>
                                            <Typography variant="caption" sx={{ opacity: 0.9 }}>
                                                Created {new Date(lead.createdAt).toLocaleDateString()}
                                            </Typography>
                                            {(lead.remarks || lead.source) && (
                                                <Chip
                                                    label={lead.source === 'takebackanalytics' ? 'From website form' : (lead.remarks || lead.source)}
                                                    size="small"
                                                    sx={{ mt: 1, maxWidth: '100%', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
                                                    color="info"
                                                    variant="outlined"
                                                />
                                            )}
                                        </Box>
                                    </Box>
                                </Box>

                                <Divider />

                                {/* Tabs */}
                                <Tabs 
                                    value={currentTab} 
                                    onChange={(e, v) => setCurrentTab(v)}
                                    variant="fullWidth"
                                    sx={{ borderBottom: 1, borderColor: 'divider' }}
                                >
                                    <Tab label="Call History" icon={<Phone sx={{ fontSize: 18 }} />} iconPosition="start" />
                                    <Tab label="Details" icon={<Info sx={{ fontSize: 18 }} />} iconPosition="start" />
                                    <Tab label="Summary" icon={<History sx={{ fontSize: 18 }} />} iconPosition="start" />
                                </Tabs>

                                {/* Tab Content */}
                                <Box sx={{ p: 3 }}>
                                    {currentTab === 0 ? (
                                        <Stack spacing={2}>
                                            {/* Call History Tab - Compact View */}
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                                                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                                    Call History ({callHistory.length})
                                                </Typography>
                                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                                    {callHistory.length > 0 && (
                                                        <Button
                                                            variant="outlined"
                                                            color="error"
                                                            size="small"
                                                            startIcon={<DeleteSweep />}
                                                            onClick={() => setDeleteCallConfirm('all')}
                                                            sx={{ textTransform: 'none' }}
                                                        >
                                                            Delete All
                                                        </Button>
                                                    )}
                                                {lead.phone && (
                                                        <>
                                                            {currentCallStatus && (
                                                                <Chip 
                                                                    label={currentCallStatus.replace('-', ' ').toUpperCase()} 
                                                                    size="small"
                                                                    color={
                                                                        currentCallStatus === 'in-progress' ? 'success' : 
                                                                        currentCallStatus === 'ringing' ? 'warning' : 
                                                                        currentCallStatus === 'completed' ? 'default' :
                                                                        currentCallStatus === 'failed' ? 'error' : 'info'
                                                                    }
                                                                    icon={
                                                                        currentCallStatus === 'in-progress' ? <PhoneInTalk /> :
                                                                        currentCallStatus === 'ringing' ? <PhoneCallback /> :
                                                                        currentCallStatus === 'initiating' ? <Schedule /> :
                                                                        <Phone />
                                                                    }
                                                                    sx={{ 
                                                                        fontWeight: 600,
                                                                        textTransform: 'capitalize'
                                                                    }}
                                                                />
                                                            )}
                                                    <Button
                                                        variant="contained"
                                                                color={activeCallSessionId && currentCallStatus === 'in-progress' ? 'error' : 'primary'}
                                                        size="small"
                                                                startIcon={
                                                                    callingLead ? <CircularProgress size={16} /> : 
                                                                    activeCallSessionId && currentCallStatus === 'in-progress' ? <Stop /> :
                                                                    <Phone />
                                                                }
                                                                onClick={activeCallSessionId && currentCallStatus === 'in-progress' ? 
                                                                    () => handleCancelCall(activeCallSessionId) : 
                                                                    handleInitiateCall
                                                                }
                                                                disabled={!canMakeCalls || callingLead || (activeCallSessionId !== null && currentCallStatus !== 'in-progress')}
                                                        sx={{ textTransform: 'none' }}
                                                    >
                                                                {callingLead ? 'Initiating...' : 
                                                                 activeCallSessionId && currentCallStatus === 'in-progress' ? 'End Call' :
                                                                 activeCallSessionId ? 'Call in Progress' : 
                                                                 'Call Now'}
                                                    </Button>
                                                        </>
                                                )}
                                                </Box>
                                            </Box>

                                            {loadingCallHistory ? (
                                                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                                    <CircularProgress />
                                                </Box>
                                            ) : callHistory.length === 0 ? (
                                                <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
                                                    <PhoneDisabled sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                                                    <Typography variant="h6" color="text.secondary" gutterBottom>
                                                        No Call History
                                                    </Typography>
                                                    <Typography variant="body2" color="text.secondary">
                                                        {lead.phone ? 'Click "Call Now" to initiate a call' : 'This lead does not have a phone number'}
                                                    </Typography>
                                                </Paper>
                                            ) : (
                                                <Stack spacing={1}>
                                                    {callHistory.map((call, idx) => (
                                                        <Accordion 
                                                            key={call._id || idx}
                                                            sx={{ 
                                                                borderLeft: '4px solid',
                                                                borderColor: call.status === 'completed' ? 'success.main' : 
                                                                             call.status === 'in-progress' ? 'info.main' :
                                                                             call.status === 'ringing' ? 'warning.main' :
                                                                             call.status === 'failed' ? 'error.main' : 'divider',
                                                                '&:before': { display: 'none' },
                                                                boxShadow: 1
                                                            }}
                                                        >
                                                            <AccordionSummary
                                                                expandIcon={<ExpandMore />}
                                                                sx={{
                                                            bgcolor: call.status === 'completed' ? (theme) => theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.15)' : 'success.light' : 
                                                                     call.status === 'in-progress' ? (theme) => theme.palette.mode === 'dark' ? 'rgba(33, 150, 243, 0.15)' : 'info.light' :
                                                                     call.status === 'ringing' ? (theme) => theme.palette.mode === 'dark' ? 'rgba(237, 108, 2, 0.15)' : 'warning.light' :
                                                                     call.status === 'failed' ? (theme) => theme.palette.mode === 'dark' ? 'rgba(211, 47, 47, 0.15)' : 'error.light' : 
                                                                     'background.default',
                                                                    '&:hover': {
                                                                        bgcolor: call.status === 'completed' ? (theme) => theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.25)' : 'success.light' : 
                                                                                 call.status === 'in-progress' ? (theme) => theme.palette.mode === 'dark' ? 'rgba(33, 150, 243, 0.25)' : 'info.light' :
                                                                                 call.status === 'ringing' ? (theme) => theme.palette.mode === 'dark' ? 'rgba(237, 108, 2, 0.25)' : 'warning.light' :
                                                                                 call.status === 'failed' ? (theme) => theme.palette.mode === 'dark' ? 'rgba(211, 47, 47, 0.25)' : 'error.light' : 
                                                                                 'action.hover',
                                                                    }
                                                                }}
                                                            >
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', pr: 2 }}>
                                                                    {getCallStatusIcon(call.status)}
                                                                    <Box sx={{ flex: 1 }}>
                                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                                            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                                                                                {call.phoneNumber}
                                                                            </Typography>
                                                                            <Chip 
                                                                                icon={getCallStatusIcon(call.status)}
                                                                                label={call.status.replace('-', ' ').toUpperCase()} 
                                                                                size="small"
                                                                                color={getCallStatusColor(call.status)}
                                                                                sx={{ fontWeight: 600, textTransform: 'capitalize' }}
                                                                            />
                                                                            {call.duration > 0 && (
                                                                                <Typography variant="caption" color="text.secondary">
                                                                                    • {formatDuration(call.duration)}
                                                                                </Typography>
                                                                            )}
                                                                        </Box>
                                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                                                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                                <CalendarToday sx={{ fontSize: 12 }} />
                                                                                {formatDateTime(call.createdAt)}
                                                                            </Typography>
                                                                            {call.metadata?.vapiEndedReason && (
                                                                                <>
                                                                                    <Typography variant="caption" color="text.secondary">•</Typography>
                                                                                    <Chip
                                                                                        label={call.metadata.vapiEndedReason}
                                                                                        color={getEndedReasonColor(call.metadata.vapiEndedReason)}
                                                                                        size="small"
                                                                                        sx={{
                                                                                            fontWeight: 700,
                                                                                            fontSize: '0.7rem',
                                                                                            height: 20,
                                                                                            boxShadow: 1,
                                                                                            '& .MuiChip-label': {
                                                                                                px: 1
                                                                                            }
                                                                                        }}
                                                                                    />
                                                                                </>
                                                                            )}
                                                                        </Box>
                                                                    </Box>
                                                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                                                    {call.status === 'in-progress' || call.status === 'ringing' ? (
                                                                        <Button
                                                                            size="small"
                                                                            variant="outlined"
                                                                            color="error"
                                                                            startIcon={<Stop />}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleCancelCall(call.sessionId);
                                                                            }}
                                                                        >
                                                                            Cancel
                                                                        </Button>
                                                                    ) : null}
                                                                        <Tooltip title="Delete Call">
                                                                            <IconButton
                                                                                size="small"
                                                                                color="error"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setDeleteCallConfirm(call._id);
                                                                                }}
                                                                                disabled={deletingCall === call._id}
                                                                            >
                                                                                {deletingCall === call._id ? (
                                                                                    <CircularProgress size={16} />
                                                                                ) : (
                                                                                    <DeleteIcon />
                                                                                )}
                                                                            </IconButton>
                                                                        </Tooltip>
                                                                    </Box>
                                                                </Box>
                                                            </AccordionSummary>
                                                            <AccordionDetails sx={{ bgcolor: 'background.paper' }}>
                                                                <Stack spacing={2}>
                                                                    {/* Ended Reason - Prominently Displayed */}
                                                                    {call.metadata?.vapiEndedReason && (
                                                                        <Box sx={{ mb: 2 }}>
                                                                            <Typography variant="caption" color="text.secondary" display="block" gutterBottom sx={{ fontWeight: 600, mb: 1 }}>
                                                                                Ended Reason (Vapi AI)
                                                                            </Typography>
                                                                            <Chip
                                                                                label={call.metadata.vapiEndedReason}
                                                                                color={getEndedReasonColor(call.metadata.vapiEndedReason)}
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

                                                                    {/* Call Duration & Timing Info */}
                                                                    <Grid container spacing={2} sx={{ mb: 3 }}>
                                                                        {call.duration > 0 && (
                                                                            <Grid item xs={6} sm={3}>
                                                                                <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: 'background.paper' }}>
                                                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                                                        Total Duration
                                                                                    </Typography>
                                                                                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main' }}>
                                                                                        {formatDuration(call.duration)}
                                                                                    </Typography>
                                                                                </Paper>
                                                                            </Grid>
                                                                        )}
                                                                        {call.activeCallTime > 0 && (
                                                                            <Grid item xs={6} sm={3}>
                                                                                <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: 'background.paper' }}>
                                                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                                                        Active Call Time
                                                                                    </Typography>
                                                                                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'success.main' }}>
                                                                                        {formatDuration(call.activeCallTime)}
                                                                                    </Typography>
                                                                                </Paper>
                                                                            </Grid>
                                                                        )}
                                                                        {call.ringingTime > 0 && (
                                                                            <Grid item xs={6} sm={3}>
                                                                                <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: 'background.paper' }}>
                                                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                                                        Ringing Time
                                                                                    </Typography>
                                                                                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'warning.main' }}>
                                                                                        {formatDuration(call.ringingTime)}
                                                                                    </Typography>
                                                                                </Paper>
                                                                            </Grid>
                                                                        )}
                                                                    </Grid>

                                                                    {/* SIP Status */}
                                                                    {call.metadata?.sipStatus && (
                                                                        <Box>
                                                                            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                                                                SIP Status
                                                                            </Typography>
                                                                            <Chip 
                                                                                label={`${call.metadata.sipStatus.code} ${call.metadata.sipStatus.message}`}
                                                                                size="small"
                                                                                sx={{ 
                                                                                    bgcolor: call.metadata.sipStatus.code === 200 ? (theme) => theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.15)' : 'success.light' :
                                                                                            call.metadata.sipStatus.code === 183 ? (theme) => theme.palette.mode === 'dark' ? 'rgba(33, 150, 243, 0.15)' : 'info.light' :
                                                                                            call.metadata.sipStatus.code === 180 ? (theme) => theme.palette.mode === 'dark' ? 'rgba(237, 108, 2, 0.15)' : 'warning.light' : 
                                                                                            (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'background.default',
                                                                                    color: 'text.primary',
                                                                                    fontWeight: 600
                                                                                }}
                                                                            />
                                                                        </Box>
                                                                    )}

                                                                    {/* Ended Reason - Prominently Displayed at Top */}
                                                                    {(() => {
                                                                        const endedReason = getResolvedEndedReason(call);
                                                                        return endedReason ? (
                                                                            <Box sx={{ mb: 2 }}>
                                                                                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                                    <ErrorIcon sx={{ fontSize: 18 }} />
                                                                                    Ended Reason
                                                                                </Typography>
                                                                                <Chip
                                                                                    label={endedReason}
                                                                                    color={getEndedReasonColor(endedReason)}
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
                                                                        ) : null;
                                                                    })()}

                                                                    {/* Vapi AI Call Logs */}
                                                                    {canViewCallLogs && (
                                                                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: call.summary ? 2 : 0 }}>
                                                                            <Button
                                                                                variant="outlined"
                                                                                size="small"
                                                                                startIcon={<Description />}
                                                                                onClick={() => {
                                                                                    setLogsCallId(call._id);
                                                                                    setLogsModalOpen(true);
                                                                                }}
                                                                            >
                                                                                View Call Logs
                                                                            </Button>
                                                                        </Box>
                                                                    )}

                                                                    {/* Call Summary */}
                                                                    {call.summary && (
                                                                        <Box>
                                                                            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                                <Info sx={{ fontSize: 18 }} />
                                                                                Call Summary
                                                                            </Typography>
                                                                            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 2 }}>
                                                                                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                                                                    {call.summary}
                                                                                </Typography>
                                                                            </Paper>
                                                                        </Box>
                                                                    )}

                                                                    {/* Delete Call Button */}
                                                                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1, borderTop: 1, borderColor: 'divider' }}>
                                                                        <Button
                                                                            size="small"
                                                                            variant="outlined"
                                                                            color="error"
                                                                            startIcon={deletingCall === call._id ? <CircularProgress size={16} /> : <DeleteIcon />}
                                                                            onClick={() => setDeleteCallConfirm(call._id)}
                                                                            disabled={deletingCall === call._id}
                                                                        >
                                                                            {deletingCall === call._id ? 'Deleting...' : 'Delete Call'}
                                                                        </Button>
                                                                    </Box>
                                                                </Stack>
                                                            </AccordionDetails>
                                                        </Accordion>
                                                    ))}
                                                </Stack>
                                            )}
                                        </Stack>
                                    ) : currentTab === 1 ? (
                                        <Stack spacing={2.5}>
                                            {/* Contact Information */}
                                            <Box>
                                                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, color: 'primary.main' }}>
                                                    Contact Information
                                                </Typography>
                                                <Stack spacing={2}>
                                                    <LeadEditableField
                                                        label="First Name"
                                                        field="firstName"
                                                        value={lead.firstName}
                                                        icon={Person}
                                                        isEditing={editMode.firstName}
                                                        isSaving={saving.firstName}
                                                        editValue={editValues.firstName}
                                                        onEditToggle={() => handleEditToggle('firstName')}
                                                        onEditChange={(value) => handleEditChange('firstName', value)}
                                                        onSave={() => handleSaveField('firstName')}
                                                        onCancel={() => handleCancelEdit('firstName')}
                                                        canEdit={canEdit}
                                                    />
                                                    <LeadEditableField
                                                        label="Last Name"
                                                        field="lastName"
                                                        value={lead.lastName}
                                                        icon={Person}
                                                        isEditing={editMode.lastName}
                                                        isSaving={saving.lastName}
                                                        editValue={editValues.lastName}
                                                        onEditToggle={() => handleEditToggle('lastName')}
                                                        onEditChange={(value) => handleEditChange('lastName', value)}
                                                        onSave={() => handleSaveField('lastName')}
                                                        onCancel={() => handleCancelEdit('lastName')}
                                                        canEdit={canEdit}
                                                    />
                                                    <LeadEditableField
                                                        label="Email"
                                                        field="email"
                                                        value={lead.email}
                                                        icon={Email}
                                                        type="email"
                                                        isEditing={editMode.email}
                                                        isSaving={saving.email}
                                                        editValue={editValues.email}
                                                        onEditToggle={() => handleEditToggle('email')}
                                                        onEditChange={(value) => handleEditChange('email', value)}
                                                        onSave={() => handleSaveField('email')}
                                                        onCancel={() => handleCancelEdit('email')}
                                                        canEdit={canEdit}
                                                    />
                                                    <LeadEditableField
                                                        label="Phone"
                                                        field="phone"
                                                        value={lead.phone}
                                                        icon={Phone}
                                                        isEditing={editMode.phone}
                                                        isSaving={saving.phone}
                                                        editValue={editValues.phone}
                                                        onEditToggle={() => handleEditToggle('phone')}
                                                        onEditChange={(value) => handleEditChange('phone', value)}
                                                        onSave={() => handleSaveField('phone')}
                                                        onCancel={() => handleCancelEdit('phone')}
                                                        canEdit={canEdit}
                                                    />
                                                </Stack>
                                            </Box>

                                            <Divider />

                                            {/* Business Information */}
                                            <Box>
                                                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, color: 'primary.main' }}>
                                                    Business Information
                                                </Typography>
                                                <Stack spacing={2}>
                                                    <LeadEditableField
                                                        label="Brand"
                                                        field="Brand"
                                                        value={lead.Brand}
                                                        icon={Business}
                                                        isEditing={editMode.Brand}
                                                        isSaving={saving.Brand}
                                                        editValue={editValues.Brand}
                                                        onEditToggle={() => handleEditToggle('Brand')}
                                                        onEditChange={(value) => handleEditChange('Brand', value)}
                                                        onSave={() => handleSaveField('Brand')}
                                                        onCancel={() => handleCancelEdit('Brand')}
                                                        canEdit={canEdit}
                                                    />
                                                    <LeadEditableField
                                                        label="Country"
                                                        field="country"
                                                        value={lead.country}
                                                        icon={LocationOn}
                                                        isEditing={editMode.country}
                                                        isSaving={saving.country}
                                                        editValue={editValues.country}
                                                        onEditToggle={() => handleEditToggle('country')}
                                                        onEditChange={(value) => handleEditChange('country', value)}
                                                        onSave={() => handleSaveField('country')}
                                                        onCancel={() => handleCancelEdit('country')}
                                                        canEdit={canEdit}
                                                    />
                                                    <LeadEditableField
                                                        label="Address"
                                                        field="Address"
                                                        value={lead.Address}
                                                        icon={LocationOn}
                                                        multiline
                                                        isEditing={editMode.Address}
                                                        isSaving={saving.Address}
                                                        editValue={editValues.Address}
                                                        onEditToggle={() => handleEditToggle('Address')}
                                                        onEditChange={(value) => handleEditChange('Address', value)}
                                                        onSave={() => handleSaveField('Address')}
                                                        onCancel={() => handleCancelEdit('Address')}
                                                        canEdit={canEdit}
                                                    />
                                                </Stack>
                                            </Box>

                                            {/* Form submission / Source (when lead came from website form e.g. takebackanalytics) */}
                                            {(lead.remarks || lead.source || lead.caseNotes || lead.lossRange) && (
                                                <>
                                                    <Divider />
                                                    <Box>
                                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, color: 'primary.main' }}>
                                                            Form submission (source)
                                                        </Typography>
                                                        <Stack spacing={2}>
                                                            {lead.remarks && (
                                                                <Box>
                                                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                                                        Remarks
                                                                    </Typography>
                                                                    <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                                                                        {lead.remarks}
                                                                    </Typography>
                                                                </Box>
                                                            )}
                                                            {lead.caseNotes && (
                                                                <Box>
                                                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                                                        What happened / Case notes
                                                                    </Typography>
                                                                    <Typography variant="body2" sx={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                                                                        {lead.caseNotes}
                                                                    </Typography>
                                                                </Box>
                                                            )}
                                                            {lead.lossRange && (
                                                                <Box>
                                                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                                                        Loss range
                                                                    </Typography>
                                                                    <Typography variant="body2">
                                                                        {lead.lossRange}
                                                                    </Typography>
                                                                </Box>
                                                            )}
                                                            {lead.source && !lead.remarks && (
                                                                <Box>
                                                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                                                        Source
                                                                    </Typography>
                                                                    <Typography variant="body2">
                                                                        {lead.source}
                                                                    </Typography>
                                                                </Box>
                                                            )}
                                                        </Stack>
                                                    </Box>
                                                </>
                                            )}

                                            <Divider />

                                            {/* Status & Agent */}
                                            <Box>
                                                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, color: 'primary.main' }}>
                                                    Lead Status
                                                </Typography>
                                                <Stack spacing={2}>
                                                    <LeadEditableField
                                                        label="Status"
                                                        field="status"
                                                        value={lead.status}
                                                        isEditing={editMode.status}
                                                        isSaving={saving.status}
                                                        editValue={editValues.status}
                                                        onEditToggle={() => handleEditToggle('status')}
                                                        onEditChange={(value) => handleEditChange('status', value)}
                                                        onSave={() => handleSaveField('status')}
                                                        onCancel={() => handleCancelEdit('status')}
                                                        canEdit={canEdit}
                                                        allowManageStatuses={canManageStatuses}
                                                    />
                                                    {lead.agent && (
                                                        <Box>
                                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                                                                <Person sx={{ fontSize: 14 }} /> Assigned Agent
                                                            </Typography>
                                                            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                    <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem' }}>
                                                                        {lead.agent.firstName?.[0]}{lead.agent.lastName?.[0]}
                                                                    </Avatar>
                                                                    <Box>
                                                                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.813rem' }}>
                                                                            {lead.agent.firstName} {lead.agent.lastName}
                                                                        </Typography>
                                                                        <Typography variant="caption" color="text.secondary">
                                                                            {lead.agent.role} • {lead.agent.email}
                                                                        </Typography>
                                                                    </Box>
                                                                </Box>
                                                            </Paper>
                                                        </Box>
                                                    )}
                                                </Stack>
                                            </Box>
                                        </Stack>
                                    ) : currentTab === 2 ? (
                                        <Stack spacing={2}>
                                            {/* Summary Tab */}
                                            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                                                <Typography variant="h4" fontWeight="bold">
                                                    {totalActivities + reminders.length}
                                                </Typography>
                                                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                                                    Total Stream Items
                                                </Typography>
                                            </Paper>

                                            <Paper variant="outlined" sx={{ p: 2 }}>
                                                <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                                                    Activity Breakdown
                                                </Typography>
                                                <Stack spacing={1}>
                                                    {['comment', 'status_change', 'assignment_change', 'field_update', 'created', 'reminder'].map(type => {
                                                        const count = type === 'reminder'
                                                            ? reminders.length
                                                            : activities.filter(a => a.type === type).length;
                                                        if (count === 0) return null;
                                                        return (
                                                            <Box key={type} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <Chip 
                                                                    label={getActivityTypeLabel(type)} 
                                                                    size="small" 
                                                                    color={getActivityTypeColor(type)}
                                                                    sx={{ fontSize: '0.7rem', height: 20 }}
                                                                />
                                                                <Typography variant="body2" fontWeight="bold">
                                                                    {count}
                                                                </Typography>
                                                            </Box>
                                                        );
                                                    })}
                                                </Stack>
                                            </Paper>

                                            <Paper variant="outlined" sx={{ p: 2 }}>
                                                <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                                                    Timeline
                                                </Typography>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                                    <Typography variant="caption" color="text.secondary">
                                                        First Activity
                                                    </Typography>
                                                    <Typography variant="body2" fontWeight="600">
                                                        {streamItems.length > 0 ? formatDateTime(streamItems[streamItems.length - 1].streamTimestamp || streamItems[streamItems.length - 1].createdAt) : 'N/A'}
                                                    </Typography>
                                                </Box>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <Typography variant="caption" color="text.secondary">
                                                        Latest Activity
                                                    </Typography>
                                                    <Typography variant="body2" fontWeight="600">
                                                        {streamItems.length > 0 ? formatDateTime(streamItems[0].streamTimestamp || streamItems[0].createdAt) : 'N/A'}
                                                    </Typography>
                                                </Box>
                                            </Paper>
                                        </Stack>
                                    ) : null}
                                </Box>
                            </Card>
                        </Grid>

                        {/* Right Column - Activity Stream or Call History (when Call History tab selected) */}
                        <Grid item xs={12} lg={8}>
                            <Card elevation={1} sx={{ borderRadius: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                            {currentTab === 0 ? 'Call History Details' : currentTab === 2 ? 'Activity Stream' : activeCallSessionId ? 'Live Call Status' : 'Activity Stream'}
                                        </Typography>
                                        {activeCallSessionId && currentTab !== 0 && (
                                            <Chip 
                                                icon={<PhoneInTalk sx={{ fontSize: 16 }} />}
                                                label="Call Active" 
                                                color="success" 
                                                size="small"
                                                sx={{ fontWeight: 600 }}
                                            />
                                        )}
                                        {currentTab !== 0 && (
                                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                            {lead && (
                                                <InlineLeadStatusCell
                                                    lead={lead}
                                                    onStatusChange={handleInlineStatusChange}
                                                    saving={updatingLeadStatus}
                                                />
                                            )}
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                startIcon={<Add />}
                                                onClick={() => openReminderModal(null)}
                                                sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
                                            >
                                                Set Reminder
                                            </Button>
                                            <FormControl size="small" sx={{ minWidth: 150 }}>
                                                <InputLabel>Filter Type</InputLabel>
                                                <Select
                                                    value={activityFilter}
                                                    label="Filter Type"
                                                    onChange={(e) => setActivityFilter(e.target.value)}
                                                    startAdornment={<FilterList sx={{ fontSize: 18, mr: 0.5 }} />}
                                                >
                                                    <MenuItem value="all">All ({streamItems.length})</MenuItem>
                                                    <MenuItem value="comment">Comments ({activities.filter(a => a.type === 'comment').length})</MenuItem>
                                                    <MenuItem value="reminder">Reminders ({reminders.length})</MenuItem>
                                                    <MenuItem value="status_change">Status Changes ({activities.filter(a => a.type === 'status_change').length})</MenuItem>
                                                    <MenuItem value="assignment_change">Agent Changes ({activities.filter(a => a.type === 'assignment_change').length})</MenuItem>
                                                    <MenuItem value="field_update">Field Updates ({activities.filter(a => a.type === 'field_update').length})</MenuItem>
                                                    <MenuItem value="created">Created ({activities.filter(a => a.type === 'created').length})</MenuItem>
                                                </Select>
                                            </FormControl>
                                            {/* ✅ Export Button */}
                                            <Tooltip title="Export Comments to PDF">
                                                <IconButton 
                                                    size="small"
                                                    onClick={() => {
                                                        toast.info('Export feature coming soon!');
                                                    }}
                                                >
                                                    <GetApp />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                        )}
                                    </Box>
                                    {/* ✅ Comment Search Bar - Only show when not on Call History tab (show on Details and Summary tabs) */}
                                    {currentTab !== 0 && (
                                    <TextField
                                        fullWidth
                                        size="small"
                                        placeholder="Search comments..."
                                        value={commentSearch}
                                        onChange={(e) => setCommentSearch(e.target.value)}
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter') {
                                                handleSearchComments();
                                            }
                                        }}
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <Search sx={{ fontSize: 20 }} />
                                                </InputAdornment>
                                            ),
                                            endAdornment: commentSearch && (
                                                <InputAdornment position="end">
                                                    {searching ? (
                                                        <CircularProgress size={16} />
                                                    ) : (
                                                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                                                            <IconButton size="small" onClick={handleClearSearch}>
                                                                <Close sx={{ fontSize: 18 }} />
                                                            </IconButton>
                                                            <IconButton size="small" onClick={handleSearchComments}>
                                                                <Search sx={{ fontSize: 18 }} />
                                                            </IconButton>
                                                        </Box>
                                                    )}
                                                </InputAdornment>
                                            )
                                        }}
                                        sx={{
                                            '& .MuiOutlinedInput-root': {
                                                borderRadius: 2
                                            }
                                        }}
                                    />
                                    )}
                                    {/* Search Results Indicator */}
                                    {showSearchResults && currentTab !== 0 && (
                                        <Box sx={{ mt: 1 }}>
                                            <Chip
                                                label={`Showing ${searchResults.length} search result(s)`}
                                                size="small"
                                                color="primary"
                                                onDelete={handleClearSearch}
                                            />
                                        </Box>
                                    )}
                                </Box>

                                {/* Comment Input - Professional Design - Only show when not on Call History tab */}
                                {currentTab !== 0 && (
                                <Box sx={{ p: 3, bgcolor: 'background.paper', borderBottom: 2, borderColor: 'divider', flexShrink: 0 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
                                        <Avatar 
                                            sx={{ 
                                                width: 40, 
                                                height: 40, 
                                                bgcolor: 'primary.main',
                                                fontSize: '0.875rem',
                                                fontWeight: 700,
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                                            }}
                                        >
                                            {authUser()?.user?.firstName?.[0]}{authUser()?.user?.lastName?.[0]}
                                        </Avatar>
                                        <Box sx={{ flex: 1 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                                    {authUser()?.user?.firstName} {authUser()?.user?.lastName}
                                                </Typography>
                                                <Chip 
                                                    label={authUser()?.user?.role} 
                                                    size="small"
                                                    sx={{ 
                                                        height: 20, 
                                                        fontSize: '0.65rem',
                                                        fontWeight: 600,
                                                        bgcolor: 'primary.main',
                                                        color: 'primary.contrastText'
                                                    }}
                                                />
                                            </Box>
                                            <Paper 
                                                elevation={0}
                                                sx={{ 
                                                    border: '2px solid',
                                                    borderColor: newComment.trim() ? 'primary.main' : 'divider',
                                                    borderRadius: 2,
                                                    overflow: 'hidden',
                                                    transition: 'all 0.3s',
                                                    '&:hover': {
                                                        borderColor: 'primary.main',
                                                        boxShadow: '0 2px 12px rgba(102, 126, 234, 0.15)'
                                                    }
                                                }}
                                            >
                                                <TextField
                                                    fullWidth
                                                    multiline
                                                    rows={4}
                                                    placeholder="Write your comment here... (Press Enter to send, Shift+Enter for new line)"
                                                    value={newComment}
                                                    onChange={(e) => setNewComment(e.target.value)}
                                                    onKeyPress={handleKeyPress}
                                                    variant="standard"
                                                    InputProps={{
                                                        disableUnderline: true,
                                                        sx: {
                                                            p: 2,
                                                            fontSize: '0.938rem',
                                                            lineHeight: 1.6,
                                                            '& textarea::placeholder': {
                                                                color: 'text.secondary',
                                                                opacity: 0.7
                                                            }
                                                        }
                                                    }}
                                                />
                                                {newComment.trim() && (
                                                    <Box sx={{ 
                                                        px: 2, 
                                                        py: 1, 
                                                        bgcolor: 'background.default',
                                                        borderTop: 1,
                                                        borderColor: 'divider',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center'
                                                    }}>
                                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                            <Info sx={{ fontSize: 12 }} />
                                                            Press Enter to send, Shift+Enter for new line
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {newComment.length} characters
                                                        </Typography>
                                                    </Box>
                                                )}
                                            </Paper>
                                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
                                                {newComment.trim() && (
                                                    <Button
                                                        variant="outlined"
                                                        size="small"
                                                        onClick={() => setNewComment('')}
                                                        sx={{
                                                            textTransform: 'none',
                                                            fontWeight: 600,
                                                            borderRadius: 2,
                                                            borderColor: 'divider'
                                                        }}
                                                    >
                                                        Clear
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="contained"
                                                    size="medium"
                                                    startIcon={submittingComment ? <CircularProgress size={16} color="inherit" /> : <Send />}
                                                    onClick={handleAddComment}
                                                    disabled={submittingComment || !newComment.trim()}
                                                    sx={{
                                                        textTransform: 'none',
                                                        fontWeight: 600,
                                                        px: 4,
                                                        py: 1,
                                                        borderRadius: 2,
                                                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                        boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                                                        '&:hover': {
                                                            background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
                                                            boxShadow: '0 6px 16px rgba(102, 126, 234, 0.4)',
                                                        },
                                                        '&:disabled': {
                                                            background: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)',
                                                            boxShadow: 'none'
                                                        }
                                                    }}
                                                >
                                                    {submittingComment ? 'Posting...' : 'Post Comment'}
                                                </Button>
                                            </Box>
                                        </Box>
                                    </Box>
                                </Box>
                                )}

                                {/* Show Call History Details when Call History tab (0) is selected, otherwise Activity Stream */}
                                {currentTab === 0 ? (
                                    /* Call History Details - Full View */
                                    <Box sx={{ 
                                        flex: 1,
                                        overflow: 'auto',
                                        p: 3,
                                        '&::-webkit-scrollbar': {
                                            width: '8px',
                                        },
                                        '&::-webkit-scrollbar-track': {
                                            background: 'background.default',
                                        },
                                        '&::-webkit-scrollbar-thumb': {
                                            background: '#c0c0c0',
                                            borderRadius: '4px',
                                            '&:hover': {
                                                background: '#a0a0a0',
                                            },
                                        },
                                    }}>
                                        {loadingCallHistory ? (
                                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                                <CircularProgress />
                                            </Box>
                                        ) : callHistory.length === 0 ? (
                                            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
                                                <PhoneDisabled sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                                                <Typography variant="h6" color="text.secondary" gutterBottom>
                                                    No Call History
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    {lead?.phone ? 'Click "Call Now" to initiate a call' : 'This lead does not have a phone number'}
                                                </Typography>
                                            </Paper>
                                        ) : (
                                            <Stack spacing={3}>
                                                {callHistory.map((call) => {
                                                    return (
                                                        <Card 
                                                        key={call._id || call.sessionId} 
                                                        elevation={2}
                                                        sx={{ 
                                                            borderRadius: 3, 
                                                            overflow: 'hidden',
                                                            border: '1px solid',
                                                            borderColor: call.status === 'completed' ? 'success.light' : 
                                                                       call.status === 'in-progress' ? 'info.light' :
                                                                       call.status === 'ringing' ? 'warning.light' :
                                                                       call.status === 'failed' ? 'error.light' : 'grey.300',
                                                            bgcolor: 'background.paper',
                                                            transition: 'all 0.3s',
                                                            '&:hover': {
                                                                boxShadow: 4,
                                                                transform: 'translateY(-2px)'
                                                            }
                                                        }}
                                                    >
                                                        {/* Header Section */}
                                                        <Box sx={{ 
                                                            p: 2.5, 
                                                            bgcolor: call.status === 'completed' ? 'success.light' : 
                                                                    call.status === 'in-progress' ? 'info.light' :
                                                                    call.status === 'ringing' ? 'warning.light' :
                                                                    call.status === 'failed' ? 'error.light' : 'grey.100',
                                                            borderBottom: '1px solid',
                                                            borderColor: 'divider'
                                                        }}>
                                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                <Box sx={{ flex: 1 }}>
                                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                                                                        <Box sx={{ 
                                                                            p: 1, 
                                                                            borderRadius: 2, 
                                                                            bgcolor: 'background.paper',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center'
                                                                        }}>
                                                                            {getCallStatusIcon(call.status)}
                                                                        </Box>
                                                                        <Box sx={{ flex: 1 }}>
                                                                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
                                                                                {call.phoneNumber}
                                                                            </Typography>
                                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                                                <Chip 
                                                                                    icon={getCallStatusIcon(call.status)}
                                                                                    label={call.status.replace('-', ' ').toUpperCase()} 
                                                                                    size="small"
                                                                                    color={getCallStatusColor(call.status)}
                                                                                    sx={{ fontWeight: 700, textTransform: 'capitalize', fontSize: '0.7rem' }}
                                                                                />
                                                                                {call.metadata?.vapiEndedReason && (
                                                                                    <Chip
                                                                                        label={call.metadata.vapiEndedReason}
                                                                                        color={getEndedReasonColor(call.metadata.vapiEndedReason)}
                                                                                        size="small"
                                                                                        sx={{
                                                                                            fontWeight: 700,
                                                                                            fontSize: '0.7rem',
                                                                                            height: 24,
                                                                                            boxShadow: 1,
                                                                                            '& .MuiChip-label': {
                                                                                                px: 1.5
                                                                                            }
                                                                                        }}
                                                                                    />
                                                                                )}
                                                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                                    <CalendarToday sx={{ fontSize: 12 }} />
                                                                                    {formatDateTime(call.createdAt || call.startedAt)}
                                                                                </Typography>
                                                                            </Box>
                                                                        </Box>
                                                                    </Box>
                                                                </Box>
                                                                <Box sx={{ display: 'flex', gap: 1 }}>
                                                                    {call.status === 'in-progress' || call.status === 'ringing' ? (
                                                                        <Button
                                                                            size="small"
                                                                            variant="contained"
                                                                            color="error"
                                                                            startIcon={<Stop />}
                                                                            onClick={() => handleCancelCall(call.sessionId)}
                                                                            sx={{ textTransform: 'none', fontWeight: 600 }}
                                                                        >
                                                                            End Call
                                                                        </Button>
                                                                    ) : null}
                                                                </Box>
                                                            </Box>
                                                        </Box>
                                                        
                                                        <Box sx={{ p: 3 }}>
                                                            {/* Call Duration & Timing Info - Professional Cards */}
                                                            <Grid container spacing={2} sx={{ mb: 3 }}>
                                                                {call.duration > 0 && (
                                                                    <Grid item xs={12} sm={4}>
                                                                        <Paper 
                                                                            elevation={0}
                                                                            sx={{ 
                                                                                p: 2, 
                                                                                textAlign: 'center', 
                                                                                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(102, 126, 234, 0.15)' : 'primary.light',
                                                                                borderRadius: 2,
                                                                                border: '1px solid',
                                                                                borderColor: 'primary.main'
                                                                            }}
                                                                        >
                                                                            <Timer sx={{ fontSize: 24, color: 'primary.main', mb: 0.5 }} />
                                                                            <Typography variant="caption" color="text.secondary" display="block" sx={{ fontWeight: 600, mb: 0.5 }}>
                                                                                Total Duration
                                                                            </Typography>
                                                                            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.main' }}>
                                                                                {formatDuration(call.duration)}
                                                                            </Typography>
                                                                        </Paper>
                                                                    </Grid>
                                                                )}
                                                                {call.activeCallTime > 0 && (
                                                                    <Grid item xs={12} sm={4}>
                                                                        <Paper 
                                                                            elevation={0}
                                                                            sx={{ 
                                                                                p: 2, 
                                                                                textAlign: 'center', 
                                                                                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.15)' : 'success.light',
                                                                                borderRadius: 2,
                                                                                border: '1px solid',
                                                                                borderColor: 'success.main'
                                                                            }}
                                                                        >
                                                                            <PhoneInTalk sx={{ fontSize: 24, color: 'success.main', mb: 0.5 }} />
                                                                            <Typography variant="caption" color="text.secondary" display="block" sx={{ fontWeight: 600, mb: 0.5 }}>
                                                                                Active Call Time
                                                                            </Typography>
                                                                            <Typography variant="h5" sx={{ fontWeight: 700, color: 'success.main' }}>
                                                                                {formatDuration(call.activeCallTime)}
                                                                            </Typography>
                                                                        </Paper>
                                                                    </Grid>
                                                                )}
                                                                {call.ringingTime > 0 && (
                                                                    <Grid item xs={12} sm={4}>
                                                                        <Paper 
                                                                            elevation={0}
                                                                            sx={{ 
                                                                                p: 2, 
                                                                                textAlign: 'center', 
                                                                                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(237, 108, 2, 0.15)' : 'warning.light',
                                                                                borderRadius: 2,
                                                                                border: '1px solid',
                                                                                borderColor: 'warning.main'
                                                                            }}
                                                                        >
                                                                            <PhoneCallback sx={{ fontSize: 24, color: 'warning.main', mb: 0.5 }} />
                                                                            <Typography variant="caption" color="text.secondary" display="block" sx={{ fontWeight: 600, mb: 0.5 }}>
                                                                                Ringing Time
                                                                            </Typography>
                                                                            <Typography variant="h5" sx={{ fontWeight: 700, color: 'warning.main' }}>
                                                                                {formatDuration(call.ringingTime)}
                                                                            </Typography>
                                                                        </Paper>
                                                                    </Grid>
                                                                )}
                                                            </Grid>

                                                            {/* Ended Reason - Prominently Displayed at Top */}
                                                            {(() => {
                                                                const endedReason = getResolvedEndedReason(call);
                                                                return endedReason ? (
                                                                    <Box sx={{ mb: 3 }}>
                                                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                            <ErrorIcon sx={{ fontSize: 18 }} />
                                                                            Ended Reason
                                                                        </Typography>
                                                                        <Chip
                                                                            label={endedReason}
                                                                            color={getEndedReasonColor(endedReason)}
                                                                            sx={{
                                                                                fontWeight: 700,
                                                                                fontSize: '0.938rem',
                                                                                py: 2.5,
                                                                                px: 2.5,
                                                                                height: 'auto',
                                                                                borderRadius: 2,
                                                                                boxShadow: 3,
                                                                                '& .MuiChip-label': {
                                                                                    px: 2,
                                                                                    py: 0.75
                                                                                }
                                                                            }}
                                                                        />
                                                                    </Box>
                                                                ) : null;
                                                            })()}

                                                            {/* View Call Logs Button */}
                                                            {canViewCallLogs && (
                                                                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
                                                                    <Button
                                                                        variant="outlined"
                                                                        size="small"
                                                                        startIcon={<Description />}
                                                                        onClick={() => {
                                                                            setLogsCallId(call._id);
                                                                            setLogsModalOpen(true);
                                                                        }}
                                                                        sx={{ textTransform: 'none' }}
                                                                    >
                                                                        View Call Logs
                                                                    </Button>
                                                                </Box>
                                                            )}

                                                            {/* SIP Events Timeline */}
                                                            {call.metadata?.sipEvents && call.metadata.sipEvents.length > 0 && (
                                                                <Box sx={{ mb: 3 }}>
                                                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary' }}>
                                                                        SIP Events Timeline
                                                                    </Typography>
                                                                    <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
                                                                        <Stack spacing={1.5}>
                                                                            {call.metadata.sipEvents.map((event, idx) => {
                                                                                const eventCode = event.code;
                                                                                const isNumber = typeof eventCode === 'number';
                                                                                const isBYE = eventCode === 'BYE';
                                                                                
                                                                                return (
                                                                                    <Box 
                                                                                        key={idx}
                                                                                        sx={{ 
                                                                                            display: 'flex', 
                                                                                            alignItems: 'center', 
                                                                                            gap: 2,
                                                                                            p: 1.5,
                                                                                            borderRadius: 1,
                                                                                            bgcolor: 'background.paper',
                                                                                            border: '1px solid',
                                                                                            borderColor: isBYE ? (theme) => theme.palette.mode === 'dark' ? 'rgba(211, 47, 47, 0.3)' : 'error.light' :
                                                                                                       (isNumber && eventCode === 200) ? (theme) => theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.3)' : 'success.light' :
                                                                                                       (isNumber && eventCode === 183) ? (theme) => theme.palette.mode === 'dark' ? 'rgba(33, 150, 243, 0.3)' : 'info.light' :
                                                                                                       (isNumber && eventCode === 180) ? (theme) => theme.palette.mode === 'dark' ? 'rgba(237, 108, 2, 0.3)' : 'warning.light' :
                                                                                                       (isNumber && eventCode === 100) ? 'divider' : 
                                                                                                       'divider'
                                                                                        }}
                                                                                    >
                                                                                        <Box sx={{ 
                                                                                            width: 40, 
                                                                                            height: 40, 
                                                                                            borderRadius: '50%',
                                                                                            bgcolor: isBYE ? 'error.main' :
                                                                                                    (isNumber && eventCode === 200) ? 'success.main' :
                                                                                                    (isNumber && eventCode === 183) ? 'info.main' :
                                                                                                    (isNumber && eventCode === 180) ? 'warning.main' :
                                                                                                    (isNumber && eventCode === 100) ? (theme => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'grey.500') : 'primary.main',
                                                                                            display: 'flex',
                                                                                            alignItems: 'center',
                                                                                            justifyContent: 'center',
                                                                                            color: (isNumber && eventCode === 100) ? 'text.secondary' : 'white',
                                                                                            fontWeight: 700,
                                                                                            fontSize: '0.875rem',
                                                                                            flexShrink: 0
                                                                                        }}>
                                                                                            {isBYE ? 'BYE' : eventCode}
                                                                                        </Box>
                                                                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                                                                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
                                                                                                {event.message}
                                                                                            </Typography>
                                                                                            <Typography variant="caption" color="text.secondary">
                                                                                                {event.type ? event.type.charAt(0).toUpperCase() + event.type.slice(1) : 'Unknown'} • {event.timestamp ? new Date(event.timestamp).toLocaleString() : 'N/A'}
                                                                                            </Typography>
                                                                                        </Box>
                                                                                    </Box>
                                                                                );
                                                                            })}
                                                                        </Stack>
                                                                    </Paper>
                                                                </Box>
                                                            )}

                                                            {/* SIP Status (Latest) */}
                                                            {call.metadata?.sipStatus && (
                                                                <Box sx={{ mb: 3 }}>
                                                                    <Typography variant="caption" color="text.secondary" display="block" gutterBottom sx={{ fontWeight: 600 }}>
                                                                        Current SIP Status
                                                                    </Typography>
                                                                    <Chip 
                                                                        label={`SIP ${call.metadata.sipStatus.code} ${call.metadata.sipStatus.message}`}
                                                                        size="medium"
                                                                        sx={{ 
                                                                            bgcolor: (typeof call.metadata.sipStatus.code === 'number' && call.metadata.sipStatus.code === 200) ? (theme) => theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.15)' : 'success.light' :
                                                                                    (typeof call.metadata.sipStatus.code === 'number' && call.metadata.sipStatus.code === 183) ? (theme) => theme.palette.mode === 'dark' ? 'rgba(33, 150, 243, 0.15)' : 'info.light' :
                                                                                    (typeof call.metadata.sipStatus.code === 'number' && call.metadata.sipStatus.code === 180) ? (theme) => theme.palette.mode === 'dark' ? 'rgba(237, 108, 2, 0.15)' : 'warning.light' :
                                                                                    (call.metadata.sipStatus.code === 'BYE') ? (theme) => theme.palette.mode === 'dark' ? 'rgba(211, 47, 47, 0.15)' : 'error.light' : 
                                                                                    (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'background.default',
                                                                            color: 'text.primary',
                                                                            fontWeight: 700,
                                                                            fontSize: '0.875rem',
                                                                            height: 32
                                                                        }}
                                                                    />
                                                                </Box>
                                                            )}

                                                            {/* Call Summary */}
                                                            {call.summary && (
                                                                <Box sx={{ mb: 3 }}>
                                                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                        <Info sx={{ fontSize: 18 }} />
                                                                        Call Summary
                                                                    </Typography>
                                                                    <Paper 
                                                                        elevation={0}
                                                                        variant="outlined" 
                                                                        sx={{ 
                                                                            p: 2.5, 
                                                                            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(33, 150, 243, 0.1)' : 'info.light',
                                                                            borderRadius: 2,
                                                                            border: '1px solid',
                                                                            borderColor: 'info.main'
                                                                        }}
                                                                    >
                                                                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, color: 'text.primary' }}>
                                                                            {call.summary}
                                                                        </Typography>
                                                                    </Paper>
                                                                </Box>
                                                            )}

                                                            {/* Conversation Transcript - Bot and User Messages */}
                                                            {call.transcript && (
                                                                <Box>
                                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                                                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                            <PhoneInTalk sx={{ fontSize: 18 }} />
                                                                            Conversation Transcript
                                                                        </Typography>
                                                                        <Tooltip title="Export Transcript as TXT">
                                                                            <Button
                                                                                size="small"
                                                                                variant="outlined"
                                                                                startIcon={<GetApp />}
                                                                                onClick={() => exportTranscript(call)}
                                                                                sx={{ 
                                                                                    textTransform: 'none',
                                                                                    fontWeight: 600,
                                                                                    borderRadius: 2
                                                                                }}
                                                                            >
                                                                                Export
                                                                            </Button>
                                                                        </Tooltip>
                                                                    </Box>
                                                                    <Paper 
                                                                        elevation={0}
                                                                        variant="outlined" 
                                                                        sx={{ 
                                                                            p: 2.5, 
                                                                            bgcolor: 'background.paper', 
                                                                            maxHeight: 500, 
                                                                            overflow: 'auto',
                                                                            borderRadius: 2,
                                                                            border: '1px solid',
                                                                            borderColor: 'divider'
                                                                        }}
                                                                    >
                                                                        {parseConversationTranscript(call.transcript)}
                                                                    </Paper>
                                                                </Box>
                                                            )}
                                                        </Box>
                                                        </Card>
                                                    );
                                                })}
                                            </Stack>
                                        )}
                                    </Box>
                                ) : activeCallSessionId ? (
                                    <Box sx={{ 
                                        flex: 1,
                                        overflow: 'auto',
                                        p: 3,
                                        '&::-webkit-scrollbar': {
                                            width: '8px',
                                        },
                                        '&::-webkit-scrollbar-track': {
                                            background: 'background.default',
                                        },
                                        '&::-webkit-scrollbar-thumb': {
                                            background: '#c0c0c0',
                                            borderRadius: '4px',
                                            '&:hover': {
                                                background: '#a0a0a0',
                                            },
                                        },
                                    }}>
                                        {loadingCallHistory ? (
                                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                                <CircularProgress />
                                            </Box>
                                        ) : callHistory.length === 0 ? (
                                            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
                                                <PhoneDisabled sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                                                <Typography variant="h6" color="text.secondary" gutterBottom>
                                                    No Call History
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    {lead?.phone ? 'Click "Call Now" to initiate a call' : 'This lead does not have a phone number'}
                                                </Typography>
                                            </Paper>
                                        ) : (
                                            <Stack spacing={2}>
                                                {callHistory.map((call) => {
                                                    const derived = {
                                                        endedReason: getResolvedEndedReason(call),
                                                        startedAt: getResolvedStartedAt(call),
                                                        endedAt: getResolvedEndedAt(call),
                                                        durationSeconds: getResolvedDuration(call),
                                                    };
                                                    return (
                                                        <Card key={call._id || call.sessionId} variant="outlined" sx={{ 
                                                        borderRadius: 2, 
                                                        overflow: 'hidden',
                                                        borderLeft: '4px solid',
                                                        borderColor: call.status === 'completed' ? 'success.main' : 
                                                                   call.status === 'in-progress' ? 'info.main' :
                                                                   call.status === 'ringing' ? 'warning.main' :
                                                                   call.status === 'failed' ? 'error.main' : 
                                                                   'divider',
                                                        bgcolor: call.status === 'in-progress' || call.status === 'ringing' ? 'action.selected' : 'background.paper'
                                                    }}>
                                                        <Box sx={{ p: 2.5 }}>
                                                            {/* Ended Reason - Prominently Displayed at Top */}
                                                            {derived.endedReason && (
                                                                <Box sx={{ mb: 2 }}>
                                                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                        <ErrorIcon sx={{ fontSize: 16 }} />
                                                                        Ended Reason
                                                                    </Typography>
                                                                    <Chip
                                                                        label={derived.endedReason}
                                                                        color={getEndedReasonColor(derived.endedReason)}
                                                                        sx={{
                                                                            fontWeight: 700,
                                                                            fontSize: '0.813rem',
                                                                            py: 1.5,
                                                                            px: 1.5,
                                                                            height: 'auto',
                                                                            borderRadius: 2,
                                                                            boxShadow: 2,
                                                                            '& .MuiChip-label': {
                                                                                px: 1,
                                                                                py: 0.5
                                                                            }
                                                                        }}
                                                                    />
                                                                </Box>
                                                            )}

                                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                                                <Box sx={{ flex: 1 }}>
                                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                                                        {getCallStatusIcon(call.status)}
                                                                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                                                            {call.phoneNumber}
                                                                        </Typography>
                                                                        <Chip 
                                                                            icon={getCallStatusIcon(call.status)}
                                                                            label={call.status.replace('-', ' ').toUpperCase()} 
                                                                            size="small"
                                                                            color={getCallStatusColor(call.status)}
                                                                            sx={{ fontWeight: 600, textTransform: 'capitalize' }}
                                                                        />
                                                                    </Box>
                                                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                        <CalendarToday sx={{ fontSize: 14 }} />
                                                                            {formatDateTime(derived.startedAt || call.createdAt)}
                                                                    </Typography>
                                                                </Box>
                                                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                                                    {call.status === 'in-progress' || call.status === 'ringing' ? (
                                                                        <Button
                                                                            size="small"
                                                                            variant="outlined"
                                                                            color="error"
                                                                            startIcon={<Stop />}
                                                                            onClick={() => handleCancelCall(call.sessionId)}
                                                                        >
                                                                            Cancel
                                                                        </Button>
                                                                    ) : null}
                                                                    {canViewCallLogs && (
                                                                        <Tooltip title="View Call Logs">
                                                                            <IconButton
                                                                                size="small"
                                                                                color="default"
                                                                                onClick={() => {
                                                                                    setLogsCallId(call._id);
                                                                                    setLogsModalOpen(true);
                                                                                }}
                                                                            >
                                                                                <Description />
                                                                            </IconButton>
                                                                        </Tooltip>
                                                                    )}
                                                                </Box>
                                                            </Box>

                                                            {/* Call Duration & Timing Info */}
                                                            <Grid container spacing={2} sx={{ mb: 2 }}>
                                                                {call.duration > 0 && (
                                                                    <Grid item xs={6} sm={3}>
                                                                        <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: 'background.paper' }}>
                                                                            <Typography variant="caption" color="text.secondary" display="block">
                                                                                Total Duration
                                                                            </Typography>
                                                                            <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main' }}>
                                                                                {formatDuration(call.duration)}
                                                                            </Typography>
                                                                        </Paper>
                                                                    </Grid>
                                                                )}
                                                                {call.activeCallTime > 0 && (
                                                                    <Grid item xs={6} sm={3}>
                                                                        <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: 'background.paper' }}>
                                                                            <Typography variant="caption" color="text.secondary" display="block">
                                                                                Active Call Time
                                                                            </Typography>
                                                                            <Typography variant="h6" sx={{ fontWeight: 600, color: 'success.main' }}>
                                                                                {formatDuration(call.activeCallTime)}
                                                                            </Typography>
                                                                        </Paper>
                                                                    </Grid>
                                                                )}
                                                                {call.ringingTime > 0 && (
                                                                    <Grid item xs={6} sm={3}>
                                                                        <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: 'background.paper' }}>
                                                                            <Typography variant="caption" color="text.secondary" display="block">
                                                                                Ringing Time
                                                                            </Typography>
                                                                            <Typography variant="h6" sx={{ fontWeight: 600, color: 'warning.main' }}>
                                                                                {formatDuration(call.ringingTime)}
                                                                            </Typography>
                                                                        </Paper>
                                                                    </Grid>
                                                                )}
                                                            </Grid>

                                                                    {/* Ended Reason - Prominently Displayed at Top */}
                                                                    {(() => {
                                                                        const endedReason = getResolvedEndedReason(call);
                                                                        return endedReason ? (
                                                                            <Box sx={{ mb: 2 }}>
                                                                                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                                    <ErrorIcon sx={{ fontSize: 16 }} />
                                                                                    Ended Reason
                                                                                </Typography>
                                                                                <Chip
                                                                                    label={endedReason}
                                                                                    color={getEndedReasonColor(endedReason)}
                                                                                    sx={{
                                                                                        fontWeight: 700,
                                                                                        fontSize: '0.813rem',
                                                                                        py: 1.5,
                                                                                        px: 1.5,
                                                                                        height: 'auto',
                                                                                        borderRadius: 2,
                                                                                        boxShadow: 2,
                                                                                        '& .MuiChip-label': {
                                                                                            px: 1,
                                                                                            py: 0.5
                                                                                        }
                                                                                    }}
                                                                                />
                                                                            </Box>
                                                                        ) : null;
                                                                    })()}

                                                                    {/* View Call Logs Button */}
                                                                    {canViewCallLogs && (
                                                                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                                                                            <Tooltip title="View Call Logs">
                                                                                <IconButton
                                                                                    size="small"
                                                                                    color="default"
                                                                                    onClick={() => {
                                                                                        setLogsCallId(call._id);
                                                                                        setLogsModalOpen(true);
                                                                                    }}
                                                                                >
                                                                                    <Description />
                                                                                </IconButton>
                                                                            </Tooltip>
                                                                        </Box>
                                                                    )}

                                                                    {/* SIP Status */}
                                                                    {call.metadata?.sipStatus && (
                                                                        <Box sx={{ mb: 2 }}>
                                                                            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                                                                SIP Status
                                                                            </Typography>
                                                                            <Chip 
                                                                                label={`${call.metadata.sipStatus.code} ${call.metadata.sipStatus.message}`}
                                                                                size="small"
                                                                                sx={{ 
                                                                                    bgcolor: call.metadata.sipStatus.code === 200 ? (theme) => theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.15)' : 'success.light' :
                                                                                            call.metadata.sipStatus.code === 183 ? (theme) => theme.palette.mode === 'dark' ? 'rgba(33, 150, 243, 0.15)' : 'info.light' :
                                                                                            call.metadata.sipStatus.code === 180 ? (theme) => theme.palette.mode === 'dark' ? 'rgba(237, 108, 2, 0.15)' : 'warning.light' : 
                                                                                            (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'background.default',
                                                                                    color: 'text.primary',
                                                                                    fontWeight: 600
                                                                                }}
                                                                            />
                                                                        </Box>
                                                                    )}
                                                        </Box>
                                                        </Card>
                                                    );
                                                })}
                                            </Stack>
                                        )}
                                    </Box>
                                ) : (
                                    /* Activity Stream - Professional Design */
                                <Box sx={{ 
                                    flex: 1,
                                    overflow: 'auto',
                                    p: 3,
                                    '&::-webkit-scrollbar': {
                                        width: '8px',
                                    },
                                    '&::-webkit-scrollbar-track': {
                                        background: 'background.default',
                                    },
                                    '&::-webkit-scrollbar-thumb': {
                                        background: '#c0c0c0',
                                        borderRadius: '4px',
                                        '&:hover': {
                                            background: '#a0a0a0',
                                        },
                                    },
                                }}>
                                    {filteredStreamItems.length === 0 ? (
                                        <Paper 
                                            elevation={0} 
                                            sx={{ 
                                                py: 8, 
                                                textAlign: 'center',
                                                bgcolor: 'background.default',
                                                borderRadius: 2,
                                                border: '2px dashed',
                                                borderColor: 'divider'
                                            }}
                                        >
                                            {activityFilter === 'reminder' ? (
                                                <Alarm sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
                                            ) : (
                                                <CommentIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
                                            )}
                                            <Typography variant="h6" color="text.secondary" gutterBottom sx={{ fontWeight: 600 }}>
                                                {activityFilter === 'all' 
                                                    ? 'No activities yet' 
                                                    : activityFilter === 'reminder'
                                                        ? 'No reminders yet'
                                                        : `No ${getActivityTypeLabel(activityFilter).toLowerCase()} activities`}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                                {activityFilter === 'all'
                                                    ? 'Start by adding your first comment or set a reminder above'
                                                    : activityFilter === 'reminder'
                                                        ? 'Click "Set Reminder" to schedule a follow-up for this lead'
                                                        : 'Try selecting a different filter'}
                                            </Typography>
                                            {(activityFilter === 'reminder' || activityFilter !== 'all') && (
                                                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
                                                    {activityFilter === 'reminder' && (
                                                        <Button
                                                            variant="contained"
                                                            size="small"
                                                            startIcon={<Add />}
                                                            onClick={() => openReminderModal(null)}
                                                            sx={{ mt: 2, borderRadius: 2 }}
                                                        >
                                                            Set Reminder
                                                        </Button>
                                                    )}
                                                    {activityFilter !== 'all' && (
                                                        <Button 
                                                            variant="outlined"
                                                            size="small" 
                                                            onClick={() => setActivityFilter('all')}
                                                            sx={{ mt: 2, borderRadius: 2 }}
                                                        >
                                                            Show All
                                                        </Button>
                                                    )}
                                                </Box>
                                            )}
                                        </Paper>
                                    ) : (
                                        <Stack spacing={3}>
                                            {filteredStreamItems.map((activity, index) => {
                                                if (activity.isReminder) {
                                                    const reminder = activity.reminder;
                                                    const isOverdue = reminder.status === 'pending' && new Date(reminder.reminderDateTime) <= new Date();
                                                    const isUpcoming = reminder.status === 'pending' && new Date(reminder.reminderDateTime) > new Date();

                                                    return (
                                                        <Box
                                                            key={activity._id || index}
                                                            sx={{
                                                                display: 'flex',
                                                                gap: 2,
                                                                alignItems: 'flex-start',
                                                            }}
                                                        >
                                                            <Avatar
                                                                sx={{
                                                                    width: 48,
                                                                    height: 48,
                                                                    bgcolor: isOverdue ? 'error.main' : 'warning.main',
                                                                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                                                    flexShrink: 0,
                                                                }}
                                                            >
                                                                <Alarm />
                                                            </Avatar>
                                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, flexWrap: 'wrap', gap: 1 }}>
                                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                                        <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '1rem' }}>
                                                                            {activity.createdBy?.userName || 'Unknown User'}
                                                                        </Typography>
                                                                        <Chip
                                                                            label={activity.createdBy?.userRole || 'admin'}
                                                                            size="small"
                                                                            sx={{
                                                                                fontSize: '0.65rem',
                                                                                height: 20,
                                                                                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                                                                                fontWeight: 600,
                                                                                textTransform: 'uppercase',
                                                                            }}
                                                                        />
                                                                        <Typography variant="caption" color="text.secondary">•</Typography>
                                                                        <Typography variant="caption" color="text.secondary">
                                                                            {getActivityTimestamp(activity)}
                                                                        </Typography>
                                                                        <Chip
                                                                            label="Reminder"
                                                                            size="small"
                                                                            color="warning"
                                                                            variant="outlined"
                                                                            sx={{ fontSize: '0.65rem', height: 20, fontWeight: 700 }}
                                                                        />
                                                                        <Chip
                                                                            label={reminder.status}
                                                                            size="small"
                                                                            color={reminderStatusColor[reminder.status] || 'default'}
                                                                            sx={{ textTransform: 'capitalize', fontSize: '0.65rem', height: 20 }}
                                                                        />
                                                                        {isUpcoming && (
                                                                            <Chip label="Upcoming" size="small" color="info" sx={{ fontSize: '0.65rem', height: 20 }} />
                                                                        )}
                                                                        {isOverdue && (
                                                                            <Chip label="Due now" size="small" color="error" sx={{ fontSize: '0.65rem', height: 20 }} />
                                                                        )}
                                                                    </Box>
                                                                </Box>
                                                                <Paper
                                                                    elevation={0}
                                                                    sx={{
                                                                        p: 2,
                                                                        borderRadius: 2,
                                                                        border: '1px solid',
                                                                        borderColor: isOverdue ? 'error.main' : 'warning.main',
                                                                        borderLeft: '4px solid',
                                                                        borderLeftColor: isOverdue ? 'error.main' : 'warning.main',
                                                                        bgcolor: (theme) => theme.palette.mode === 'dark'
                                                                            ? 'rgba(255, 152, 0, 0.08)'
                                                                            : 'rgba(255, 152, 0, 0.06)',
                                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                                                    }}
                                                                >
                                                                    <Typography variant="body1" sx={{ fontWeight: 700, mb: 0.75 }}>
                                                                        {reminder.title}
                                                                    </Typography>
                                                                    {reminder.description && (
                                                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, whiteSpace: 'pre-wrap' }}>
                                                                            {reminder.description}
                                                                        </Typography>
                                                                    )}
                                                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                                                                        <Chip
                                                                            icon={<Schedule sx={{ fontSize: 14 }} />}
                                                                            label={`Due ${formatReminderDateTime(reminder.reminderDateTime)}`}
                                                                            size="small"
                                                                            variant="outlined"
                                                                        />
                                                                        <Chip
                                                                            icon={<AccessTime sx={{ fontSize: 14 }} />}
                                                                            label={`Notify ${reminder.notifyBeforeMinutes || 10} min before`}
                                                                            size="small"
                                                                            variant="outlined"
                                                                        />
                                                                    </Stack>
                                                                    <Stack direction="row" spacing={1} flexWrap="wrap">
                                                                        {reminder.status === 'pending' && (
                                                                            <Button
                                                                                size="small"
                                                                                variant="contained"
                                                                                color="success"
                                                                                startIcon={<CheckCircle />}
                                                                                onClick={() => handleCompleteReminder(reminder)}
                                                                                sx={{ textTransform: 'none' }}
                                                                            >
                                                                                Complete
                                                                            </Button>
                                                                        )}
                                                                        <Button
                                                                            size="small"
                                                                            variant="outlined"
                                                                            startIcon={<Edit />}
                                                                            onClick={() => openReminderModal(reminder)}
                                                                            sx={{ textTransform: 'none' }}
                                                                        >
                                                                            Edit
                                                                        </Button>
                                                                        <Button
                                                                            size="small"
                                                                            variant="outlined"
                                                                            color="error"
                                                                            startIcon={<DeleteIcon />}
                                                                            onClick={() => handleDeleteReminder(reminder)}
                                                                            sx={{ textTransform: 'none' }}
                                                                        >
                                                                            Delete
                                                                        </Button>
                                                                    </Stack>
                                                                </Paper>
                                                            </Box>
                                                        </Box>
                                                    );
                                                }

                                                return (
                                                <Box
                                                    key={activity._id || index}
                                                    sx={{ 
                                                        display: 'flex',
                                                        gap: 2,
                                                        alignItems: 'flex-start'
                                                    }}
                                                >
                                                    {/* User Avatar */}
                                                    <Avatar 
                                                        sx={{ 
                                                            width: 48, 
                                                            height: 48, 
                                                            fontSize: '1rem',
                                                            bgcolor: activity.type === 'comment' ? 'primary.main' : 'secondary.main',
                                                            fontWeight: 700,
                                                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                                            flexShrink: 0
                                                        }}
                                                    >
                                                        {activity.createdBy?.userName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'SYS'}
                                                    </Avatar>

                                                    {/* Activity Content */}
                                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                                        {/* Header */}
                                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, flexWrap: 'wrap' }}>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                                <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '1rem' }}>
                                                                    {activity.createdBy?.userName || 'System'}
                                                                </Typography>
                                                                <Chip
                                                                    label={activity.createdBy?.userRole || 'system'}
                                                                    size="small"
                                                                    sx={{ 
                                                                        fontSize: '0.65rem',
                                                                        height: 20,
                                                                        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                                                                        fontWeight: 600,
                                                                        textTransform: 'uppercase'
                                                                    }}
                                                                />
                                                                <Typography variant="caption" color="text.secondary">•</Typography>
                                                                <Typography variant="caption" color="text.secondary">
                                                                    {getActivityTimestamp(activity)}
                                                                </Typography>
                                                                {activity.isEdited && (
                                                                    <Tooltip title="Click to view edit history">
                                                                        <Chip
                                                                            label="Edited"
                                                                            size="small"
                                                                            variant="outlined"
                                                                            sx={{ 
                                                                                fontSize: '0.6rem',
                                                                                height: 18,
                                                                                cursor: 'pointer'
                                                                            }}
                                                                            onClick={() => {
                                                                                setSelectedComment(activity);
                                                                                handleViewHistory();
                                                                            }}
                                                                        />
                                                                    </Tooltip>
                                                                )}
                                                                {activity.quotedComment && (
                                                                    <Tooltip title="Quote Reply">
                                                                        <Chip
                                                                            icon={<FormatQuote sx={{ fontSize: 12 }} />}
                                                                            label="Quote Reply"
                                                                            size="small"
                                                                            color="primary"
                                                                            variant="outlined"
                                                                            sx={{ 
                                                                                fontSize: '0.6rem',
                                                                                height: 18
                                                                            }}
                                                                        />
                                                                    </Tooltip>
                                                                )}
                                                                <Chip
                                                                    label={getActivityTypeLabel(activity.type)}
                                                                    size="small"
                                                                    color={getActivityTypeColor(activity.type)}
                                                                    variant="outlined"
                                                                    sx={{ 
                                                                        fontSize: '0.7rem',
                                                                        height: 22,
                                                                        fontWeight: 600,
                                                                        borderWidth: 2
                                                                    }}
                                                                />
                                                            </Box>

                                                            {/* ✅ Action Menu for Comments Only */}
                                                            {activity.type === 'comment' && (
                                                                <IconButton 
                                                                    size="small"
                                                                    onClick={(e) => handleCommentMenuOpen(e, activity)}
                                                                    sx={{ ml: 'auto' }}
                                                                >
                                                                    <MoreVert sx={{ fontSize: 18 }} />
                                                                </IconButton>
                                                            )}
                                                        </Box>

                                                        {/* ✅ Pin & Important Indicators */}
                                                        {(activity.isPinned || activity.isImportant) && (
                                                            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                                                                {activity.isPinned && (
                                                                    <Chip
                                                                        icon={<PushPin sx={{ fontSize: 14 }} />}
                                                                        label={`Pinned by ${activity.pinnedBy?.userName || 'Admin'}`}
                                                                        size="small"
                                                                        color="secondary"
                                                                        sx={{ fontSize: '0.7rem', height: 24 }}
                                                                    />
                                                                )}
                                                                {activity.isImportant && (
                                                                    <Chip
                                                                        icon={<Flag sx={{ fontSize: 14 }} />}
                                                                        label="Important"
                                                                        size="small"
                                                                        color="warning"
                                                                        sx={{ fontSize: '0.7rem', height: 24 }}
                                                                    />
                                                                )}
                                                            </Box>
                                                        )}

                                                        {/* Comment/Activity Bubble */}
                                                        <Paper 
                                                            elevation={0}
                                                            sx={{ 
                                                                p: 2.5,
                                                                mt: 1,
                                                                bgcolor: activity.isPinned 
                                                                    ? (theme) => theme.palette.mode === 'dark' ? 'rgba(251, 192, 45, 0.15)' : '#fff8e1'
                                                                    : activity.isImportant 
                                                                        ? (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 152, 0, 0.15)' : '#fff3e0'
                                                                        : activity.type === 'comment' ? 'background.paper' : 'background.default',
                                                                borderRadius: '12px',
                                                                        border: activity.isPinned || activity.isImportant ? '2px solid' : '1px solid',
                                                                borderColor: activity.isPinned 
                                                                    ? 'warning.main' 
                                                                    : activity.isImportant 
                                                                        ? 'warning.dark'
                                                                        : 'divider',
                                                                position: 'relative',
                                                                boxShadow: activity.type === 'comment' ? '0 2px 8px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.06)',
                                                                transition: 'all 0.2s',
                                                                '&:hover': {
                                                                    boxShadow: activity.type === 'comment' ? '0 4px 12px rgba(0,0,0,0.12)' : '0 2px 8px rgba(0,0,0,0.1)',
                                                                    borderColor: activity.type === 'comment' ? (theme) => theme.palette.mode === 'dark' ? 'rgba(102, 126, 234, 0.5)' : 'primary.light' : 'divider'
                                                                },
                                                                '&::before': activity.type === 'comment' ? {
                                                                    content: '""',
                                                                    position: 'absolute',
                                                                    left: '-8px',
                                                                    top: '12px',
                                                                    width: 0,
                                                                    height: 0,
                                                                    borderTop: '8px solid transparent',
                                                                    borderBottom: '8px solid transparent',
                                                                    borderRight: (theme) => `8px solid ${activity.isPinned ? theme.palette.warning.main : activity.isImportant ? theme.palette.warning.dark : theme.palette.divider}`,
                                                                } : {}
                                                            }}
                                                        >
                                                            {/* ✅ Quoted Comment INSIDE Bubble - Cleaner Design */}
                                                            {activity.quotedComment && (
                                                                <Box 
                                                                    sx={{ 
                                                                        mb: 1.5,
                                                                        p: 1.5,
                                                                        bgcolor: 'rgba(102, 126, 234, 0.08)',
                                                                        borderLeft: '3px solid',
                                                                        borderColor: 'primary.main',
                                                                        borderRadius: 1
                                                                    }}
                                                                >
                                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                                                                        <FormatQuote sx={{ fontSize: 14, color: 'primary.main' }} />
                                                                        <Typography variant="caption" fontWeight="bold" color="primary.main">
                                                                            {activity.quotedComment.author?.userName}
                                                                        </Typography>
                                                                        <Chip 
                                                                            label={activity.quotedComment.author?.userRole} 
                                                                            size="small" 
                                                                            sx={{ 
                                                                                height: 16, 
                                                                                fontSize: '0.6rem',
                                                                                bgcolor: 'primary.main',
                                                                                color: 'primary.contrastText'
                                                                            }}
                                                                        />
                                                                    </Box>
                                                                    <Typography 
                                                                        variant="body2" 
                                                                        sx={{ 
                                                                            fontSize: '0.813rem',
                                                                            color: 'text.secondary',
                                                                            fontStyle: 'italic',
                                                                            overflow: 'hidden',
                                                                            textOverflow: 'ellipsis',
                                                                            display: '-webkit-box',
                                                                            WebkitLineClamp: 2,
                                                                            WebkitBoxOrient: 'vertical',
                                                                            lineHeight: 1.4
                                                                        }}
                                                                    >
                                                                        {activity.quotedComment.content}
                                                                    </Typography>
                                                                </Box>
                                                            )}
                                                            
                                                            {/* ✅ Actual Comment Content */}
                                                            <Typography 
                                                                variant="body1" 
                                                                sx={{ 
                                                                    fontSize: '0.938rem',
                                                                    lineHeight: 1.6,
                                                                    whiteSpace: 'pre-wrap',
                                                                    wordBreak: 'break-word',
                                                                    color: 'text.primary',
                                                                    fontWeight: 400
                                                                }}
                                                            >
                                                                {activity.type === 'comment' 
                                                                    ? highlightMentions(activity.comment || activity.description || 'No description')
                                                                    : getActivityDisplayDescription(activity)}
                                                            </Typography>

                                                            {/* ✅ Call Summary Display */}
                                                            {activity.type === 'call_logged' && activity.metadata && (
                                                                <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(25, 118, 210, 0.08)', borderRadius: 2, borderLeft: '3px solid', borderColor: 'primary.main' }}>
                                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                                                                        <Phone sx={{ fontSize: 18, color: 'primary.main' }} />
                                                                        <Typography variant="subtitle2" fontWeight="bold" color="primary.main">
                                                                            Call Summary
                                                                        </Typography>
                                                                        {activity.metadata.duration && (
                                                                            <Chip 
                                                                                label={`${Math.floor(activity.metadata.duration / 60)}:${String(activity.metadata.duration % 60).padStart(2, '0')}`}
                                                                                size="small"
                                                                                sx={{ height: 20, fontSize: '0.7rem', bgcolor: 'primary.main', color: 'primary.contrastText' }}
                                                                            />
                                                                        )}
                                                                    </Box>
                                                                    <Typography 
                                                                        variant="body2" 
                                                                        sx={{ 
                                                                            fontSize: '0.875rem',
                                                                            lineHeight: 1.6,
                                                                            whiteSpace: 'pre-wrap',
                                                                            wordBreak: 'break-word',
                                                                            color: 'text.primary',
                                                                            mb: activity.metadata.transcript ? 1.5 : 0
                                                                        }}
                                                                    >
                                                                        {activity.comment || activity.description || 'No summary available'}
                                                                    </Typography>
                                                                    {activity.metadata.transcript && (
                                                                        <Box sx={{ mt: 1.5 }}>
                                                                            <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                                                                Full Transcript:
                                                                            </Typography>
                                                                            <Typography 
                                                                                variant="body2" 
                                                                                sx={{ 
                                                                                    fontSize: '0.813rem',
                                                                                    lineHeight: 1.5,
                                                                                    whiteSpace: 'pre-wrap',
                                                                                    wordBreak: 'break-word',
                                                                                    color: 'text.secondary',
                                                                                    fontStyle: 'italic',
                                                                                    maxHeight: '200px',
                                                                                    overflowY: 'auto',
                                                                                    p: 1,
                                                                                    bgcolor: 'rgba(0,0,0,0.02)',
                                                                                    borderRadius: 1
                                                                                }}
                                                                            >
                                                                                {activity.metadata.transcript}
                                                                            </Typography>
                                                                        </Box>
                                                                    )}
                                                                </Box>
                                                            )}
                                                            
                                                            {/* ✅ Show Mentions Below Comment */}
                                                            {activity.mentions && activity.mentions.length > 0 && (
                                                                <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                                                                    <AlternateEmail sx={{ fontSize: 14, color: 'text.secondary' }} />
                                                                    <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                                                                        Mentioned:
                                                                    </Typography>
                                                                    {activity.mentions.map((mention, idx) => (
                                                                        <Chip
                                                                            key={idx}
                                                                            label={mention.userName}
                                                                            size="small"
                                                                            sx={{
                                                                                height: 20,
                                                                                fontSize: '0.7rem',
                                                                                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(102, 126, 234, 0.2)' : 'primary.light',
                                                                                color: (theme) => theme.palette.mode === 'dark' ? 'primary.light' : 'primary.dark'
                                                                            }}
                                                                        />
                                                                    ))}
                                                                </Box>
                                                            )}

                                                            {/* ✅ Attachments */}
                                                            {activity.attachments && activity.attachments.length > 0 && (
                                                                <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                                                    {activity.attachments.map((attachment, idx) => (
                                                                        <Chip
                                                                            key={idx}
                                                                            icon={<AttachFile sx={{ fontSize: 14 }} />}
                                                                            label={attachment.fileName}
                                                                            size="small"
                                                                            onClick={() => window.open(attachment.fileUrl, '_blank')}
                                                                            sx={{ cursor: 'pointer' }}
                                                                        />
                                                                    ))}
                                                                </Box>
                                                            )}

                                                            {/* ✅ Comment Actions Bar (Like, Reply) - Only for comments */}
                                                            {activity.type === 'comment' && (
                                                                <Box sx={{ 
                                                                    display: 'flex', 
                                                                    gap: 1, 
                                                                    mt: 2, 
                                                                    pt: 1.5,
                                                                    borderTop: '1px solid',
                                                                    borderColor: 'divider',
                                                                    alignItems: 'center'
                                                                }}>
                                                                    {/* Like Button */}
                                                                    <Tooltip title={hasUserLiked(activity) ? 'Unlike' : 'Like'}>
                                                                        <Button
                                                                            size="small"
                                                                            startIcon={hasUserLiked(activity) ? <ThumbUp sx={{ fontSize: 16 }} /> : <ThumbUpOutlined sx={{ fontSize: 16 }} />}
                                                                            onClick={(e) => handleToggleLike(activity, e)}
                                                                            sx={{
                                                                                textTransform: 'none',
                                                                                fontSize: '0.75rem',
                                                                                minWidth: 'auto',
                                                                                px: 1.5,
                                                                                py: 0.5,
                                                                                color: hasUserLiked(activity) ? 'primary.main' : 'text.secondary',
                                                                                fontWeight: hasUserLiked(activity) ? 700 : 500,
                                                                                '&:hover': {
                                                                                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(102, 126, 234, 0.2)' : 'primary.light',
                                                                                    color: (theme) => theme.palette.mode === 'dark' ? 'primary.light' : 'primary.dark'
                                                                                }
                                                                            }}
                                                                        >
                                                                            {activity.likes?.length > 0 && (
                                                                                <Typography 
                                                                                    variant="caption" 
                                                                                    sx={{ 
                                                                                        ml: 0.5,
                                                                                        fontWeight: 'bold',
                                                                                        cursor: 'pointer'
                                                                                    }}
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleShowLikes(activity);
                                                                                    }}
                                                                                >
                                                                                    {activity.likes.length}
                                                                                </Typography>
                                                                            )}
                                                                        </Button>
                                                                    </Tooltip>

                                                                    {/* Reply Button */}
                                                                    <Tooltip title="Reply">
                                                                        <Button
                                                                            size="small"
                                                                            startIcon={<Reply sx={{ fontSize: 16 }} />}
                                                                            onClick={() => {
                                                                                setSelectedComment(activity);
                                                                                handleNestedReplyClick();
                                                                            }}
                                                                            sx={{
                                                                                textTransform: 'none',
                                                                                fontSize: '0.75rem',
                                                                                px: 1.5,
                                                                                py: 0.5,
                                                                                color: 'text.secondary',
                                                                                '&:hover': {
                                                                                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.2)' : 'success.light',
                                                                                    color: (theme) => theme.palette.mode === 'dark' ? 'success.light' : 'success.dark'
                                                                                }
                                                                            }}
                                                                        >
                                                                            {activity.replies?.length > 0 && (
                                                                                <Typography variant="caption" sx={{ ml: 0.5, fontWeight: 'bold' }}>
                                                                                    {activity.replies.length}
                                                                                </Typography>
                                                                            )}
                                                                        </Button>
                                                                    </Tooltip>

                                                                    {/* Show Replies Button */}
                                                                    {activity.replies && activity.replies.length > 0 && (
                                                                        <Button
                                                                            size="small"
                                                                            onClick={() => handleToggleReplies(activity._id)}
                                                                            sx={{
                                                                                textTransform: 'none',
                                                                                fontSize: '0.7rem',
                                                                                px: 1,
                                                                                py: 0.5,
                                                                                color: 'primary.main'
                                                                            }}
                                                                        >
                                                                            {expandedReplies.has(activity._id) ? 'Hide' : 'View'} {activity.replies.length} {activity.replies.length === 1 ? 'reply' : 'replies'}
                                                                        </Button>
                                                                    )}
                                                                </Box>
                                                            )}
                                                        </Paper>

                                                        {/* ✅ Nested Replies Display - Facebook-Style */}
                                                        {activity.type === 'comment' && expandedReplies.has(activity._id) && (
                                                            <Box sx={{ mt: 2 }}>
                                                                {loadingReplies[activity._id] ? (
                                                                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                                                                        <CircularProgress size={20} />
                                                                    </Box>
                                                                ) : (
                                                                    <Stack spacing={1.5}>
                                                                        {(nestedReplies[activity._id] || []).map((reply, replyIdx) => (
                                                                            <Box 
                                                                                key={reply._id} 
                                                                                sx={{ 
                                                                                    pl: { xs: 2, sm: 6 },
                                                                                    py: 1.5,
                                                                                    bgcolor: replyIdx % 2 === 0 ? 'rgba(0,0,0,0.01)' : 'transparent',
                                                                                    borderRadius: 1,
                                                                                    '&:hover': { bgcolor: 'rgba(102, 126, 234, 0.04)' }
                                                                                }}
                                                                            >
                                                                                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                                                                                    <Avatar sx={{ 
                                                                                        width: 32, 
                                                                                        height: 32, 
                                                                                        fontSize: '0.7rem', 
                                                                                        bgcolor: 'success.main',
                                                                                        flexShrink: 0
                                                                                    }}>
                                                                                        {reply.createdBy?.userName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'R'}
                                                                                    </Avatar>
                                                                                    
                                                                                    <Box sx={{ flex: 1 }}>
                                                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5, flexWrap: 'wrap' }}>
                                                                                            <Typography variant="subtitle2" fontWeight="bold" sx={{ fontSize: '0.875rem' }}>
                                                                                                {reply.createdBy?.userName}
                                                                                            </Typography>
                                                                                            <Chip 
                                                                                                label={reply.createdBy?.userRole} 
                                                                                                size="small"
                                                                                                sx={{ height: 18, fontSize: '0.65rem', bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' }}
                                                                                            />
                                                                                            <Typography variant="caption" color="text.secondary">
                                                                                                {formatDateTime(reply.createdAt)}
                                                                                            </Typography>
                                                                                        </Box>
                                                                                        
                                                                                        {/* Replying to */}
                                                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                                                                                            <Reply sx={{ fontSize: 12, color: 'text.secondary' }} />
                                                                                            <Typography variant="caption" color="text.secondary">Replying to</Typography>
                                                                                            <Typography variant="caption" fontWeight="bold" color="primary.main">
                                                                                                {activity.createdBy?.userName}
                                                                                            </Typography>
                                                                                        </Box>
                                                                                        
                                                                                        {/* Reply Content */}
                                                                                        <Typography variant="body2" sx={{ fontSize: '0.875rem', lineHeight: 1.5, mb: 1 }}>
                                                                                            {highlightMentions(reply.comment)}
                                                                                        </Typography>
                                                                                        
                                                                                        {/* Actions */}
                                                                                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                                                                            <Button
                                                                                                size="small"
                                                                                                startIcon={hasUserLiked(reply) ? <ThumbUp sx={{ fontSize: 14 }} /> : <ThumbUpOutlined sx={{ fontSize: 14 }} />}
                                                                                                onClick={(e) => handleToggleLike(reply, e)}
                                                                                                sx={{
                                                                                                    textTransform: 'none',
                                                                                                    fontSize: '0.7rem',
                                                                                                    px: 0.5,
                                                                                                    color: hasUserLiked(reply) ? 'primary.main' : 'text.secondary',
                                                                                                    fontWeight: 600,
                                                                                                    '&:hover': { bgcolor: 'transparent' }
                                                                                                }}
                                                                                            >
                                                                                                {reply.likes?.length > 0 ? `Like (${reply.likes.length})` : 'Like'}
                                                                                            </Button>
                                                                                            <Typography variant="caption" color="text.secondary">•</Typography>
                                                                                            <Button
                                                                                                size="small"
                                                                                                onClick={() => { setSelectedComment(reply); handleNestedReplyClick(); }}
                                                                                                sx={{
                                                                                                    textTransform: 'none',
                                                                                                    fontSize: '0.7rem',
                                                                                                    px: 0.5,
                                                                                                    color: 'text.secondary',
                                                                                                    fontWeight: 600,
                                                                                                    '&:hover': { bgcolor: 'transparent' }
                                                                                                }}
                                                                                            >
                                                                                                Reply
                                                                                            </Button>
                                                                                            <Typography variant="caption" color="text.secondary">•</Typography>
                                                                                            <IconButton size="small" onClick={(e) => handleCommentMenuOpen(e, reply)} sx={{ p: 0, ml: 'auto' }}>
                                                                                                <MoreVert sx={{ fontSize: 14 }} />
                                                                                            </IconButton>
                                                                                        </Box>
                                                                                    </Box>
                                                                                </Box>
                                                                            </Box>
                                                                        ))}
                                                                    </Stack>
                                                                )}
                                                            </Box>
                                                        )}
                                                    </Box>
                                                </Box>
                                            );
                                            })}
                                        </Stack>
                                    )}
                                </Box>
                                )}
                            </Card>
                        </Grid>
                    </Grid>
                        </Box>
                    </Box>
                </Box>

            {/* Assign Agent Dialog */}
            <Dialog 
                open={assignDialogOpen} 
                onClose={() => setAssignDialogOpen(false)}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6">Assign Lead to Agent</Typography>
                        <IconButton onClick={() => setAssignDialogOpen(false)}>
                            <Close />
                        </IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ px: { xs: 2, sm: 3 }, pt: 2 }}>
                    <Typography sx={{ mb: 2 }}>
                        Assign <strong>{lead?.firstName} {lead?.lastName}</strong> to an agent:
                    </Typography>
                    <FormControl fullWidth size="small">
                        <InputLabel>Agent</InputLabel>
                        <Select
                            value={selectedAgentId}
                            label="Agent"
                            onChange={(e) => setSelectedAgentId(e.target.value)}
                        >
                            <MenuItem value="">
                                <em>Unassigned</em>
                            </MenuItem>
                            {agents
                                .filter(a => a.role === 'admin' || a.role === 'subadmin' || a.role === 'superadmin')
                                .map(agent => (
                                    <MenuItem key={agent._id} value={agent._id}>
                                        {agent.firstName} {agent.lastName} ({agent.role}) - {agent.email}
                                        {currentUserLatest?._id === agent._id ? ' (self)' : ''}
                                    </MenuItem>
                                ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAssignDialogOpen(false)} disabled={assigning}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={async () => {
                            try {
                                if (!selectedAgentId) {
                                    toast.error('Please select an agent');
                                    return;
                                }
                                setAssigning(true);
                                const res = await assignLeadsApi([leadId], selectedAgentId);
                                if (res.success) {
                                    toast.success('Lead assigned successfully');
                                    setSelectedAgentId("");
                                    setAssignDialogOpen(false);
                                    fetchLeadData(true);
                                } else {
                                    toast.error(res.msg || 'Failed to assign lead');
                                }
                            } catch (err) {
                                console.error('Assign error:', err);
                                toast.error('Error assigning lead');
                            } finally {
                                setAssigning(false);
                            }
                        }}
                        disabled={assigning || !selectedAgentId}
                        startIcon={assigning ? <CircularProgress size={20} /> : <People />}
                    >
                        {assigning ? 'Assigning...' : 'Assign'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ✅ Comment Action Menu */}
            <Menu
                anchorEl={commentMenuAnchor}
                open={Boolean(commentMenuAnchor)}
                onClose={handleCommentMenuClose}
                PaperProps={{
                    elevation: 3,
                    sx: { borderRadius: 2, minWidth: 200 }
                }}
            >
                {/* Edit (only own comments) */}
                {selectedComment && canEditComment(selectedComment) && (
                    <MenuItem onClick={handleEditCommentClick}>
                        <Edit sx={{ mr: 1, fontSize: 20 }} />
                        Edit Comment
                    </MenuItem>
                )}
                
                {/* View History (if edited) */}
                {selectedComment?.isEdited && (
                    <MenuItem onClick={handleViewHistory}>
                        <HistoryOutlined sx={{ mr: 1, fontSize: 20 }} />
                        View Edit History
                    </MenuItem>
                )}
                
                {/* Quote Reply */}
                <MenuItem onClick={handleQuoteReplyClick}>
                    <FormatQuote sx={{ mr: 1, fontSize: 20 }} />
                    Quote Reply
                </MenuItem>
                
                {/* Nested Reply */}
                <MenuItem onClick={handleNestedReplyClick}>
                    <Reply sx={{ mr: 1, fontSize: 20 }} />
                    Reply
                </MenuItem>
                
                <Divider />
                
                {/* Pin (admin/superadmin only) */}
                {canPinComment() && (
                    <MenuItem onClick={handleTogglePin}>
                        {selectedComment?.isPinned ? <PushPinOutlined sx={{ mr: 1, fontSize: 20 }} /> : <PushPin sx={{ mr: 1, fontSize: 20 }} />}
                        {selectedComment?.isPinned ? 'Unpin Comment' : 'Pin Comment'}
                    </MenuItem>
                )}
                
                {/* Mark Important (admin/superadmin only) */}
                {canPinComment() && (
                    <MenuItem onClick={handleToggleImportant}>
                        {selectedComment?.isImportant ? <FlagOutlined sx={{ mr: 1, fontSize: 20 }} /> : <Flag sx={{ mr: 1, fontSize: 20 }} />}
                        {selectedComment?.isImportant ? 'Unmark Important' : 'Mark as Important'}
                    </MenuItem>
                )}
                
                {/* View Likes */}
                {selectedComment?.likes && selectedComment.likes.length > 0 && (
                    <MenuItem onClick={() => handleShowLikes(selectedComment)}>
                        <ThumbUp sx={{ mr: 1, fontSize: 20 }} />
                        View Likes ({selectedComment.likes.length})
                    </MenuItem>
                )}
                
                <Divider />
                
                {/* Delete (role-based) */}
                {selectedComment && canDeleteComment(selectedComment) && (
                    <MenuItem onClick={handleDeleteCommentClick} sx={{ color: 'error.main' }}>
                        <DeleteIcon sx={{ mr: 1, fontSize: 20 }} />
                        Delete Comment
                    </MenuItem>
                )}
            </Menu>

            {/* ✅ Edit Comment Dialog */}
            <Dialog
                open={editCommentDialogOpen}
                onClose={() => !editingComment && setEditCommentDialogOpen(false)}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6">Edit Comment</Typography>
                        <IconButton onClick={() => setEditCommentDialogOpen(false)} disabled={editingComment}>
                            <Close />
                        </IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ px: { xs: 2, sm: 3 }, pt: 2 }}>
                    <TextField
                        fullWidth
                        multiline
                        rows={6}
                        label="Comment Content"
                        value={editCommentContent}
                        onChange={(e) => setEditCommentContent(e.target.value)}
                        disabled={editingComment}
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        fullWidth
                        label="Edit Reason (optional)"
                        placeholder="Why are you editing this comment?"
                        value={editCommentReason}
                        onChange={(e) => setEditCommentReason(e.target.value)}
                        disabled={editingComment}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditCommentDialogOpen(false)} disabled={editingComment}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleEditCommentSubmit}
                        disabled={editingComment || !editCommentContent.trim()}
                        startIcon={editingComment ? <CircularProgress size={20} /> : <Save />}
                    >
                        {editingComment ? 'Saving...' : 'Save Changes'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ✅ Delete Confirmation Dialog */}
            <Dialog
                open={deleteConfirmOpen}
                onClose={() => !deletingComment && setDeleteConfirmOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    <Box display="flex" alignItems="center" gap={1}>
                        <DeleteIcon color="error" />
                        <Typography variant="h6">Delete Comment</Typography>
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Typography>
                        Are you sure you want to delete this comment by <strong>{selectedComment?.createdBy?.userName}</strong>?
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        This action cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteConfirmOpen(false)} disabled={deletingComment}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={handleDeleteCommentConfirm}
                        disabled={deletingComment}
                        startIcon={deletingComment ? <CircularProgress size={20} /> : <DeleteIcon />}
                    >
                        {deletingComment ? 'Deleting...' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ✅ Edit History Dialog */}
            <Dialog
                open={historyDialogOpen}
                onClose={() => setHistoryDialogOpen(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Box display="flex" alignItems="center" gap={1}>
                            <HistoryOutlined />
                            <Typography variant="h6">Edit History</Typography>
                        </Box>
                        <IconButton onClick={() => setHistoryDialogOpen(false)}>
                            <Close />
                        </IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ px: { xs: 2, sm: 3 }, pt: 2 }}>
                    {loadingHistory ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <CircularProgress />
                        </Box>
                    ) : commentHistory.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" textAlign="center" py={3}>
                            No edit history available
                        </Typography>
                    ) : (
                        <Stack spacing={2}>
                            {commentHistory.map((edit, index) => (
                                <Card key={index} variant="outlined">
                                    <CardContent>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                            <Box>
                                                <Typography variant="subtitle2" fontWeight="bold">
                                                    {edit.editedBy?.userName}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {formatDateTime(edit.editedAt)}
                                                </Typography>
                                            </Box>
                                            <Chip label={edit.editedBy?.userRole} size="small" />
                                        </Box>
                                        <Divider sx={{ my: 1 }} />
                                        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                            Previous Content:
                                        </Typography>
                                        <Paper elevation={0} sx={{ p: 1.5, bgcolor: 'background.default', mb: 1 }}>
                                            <Typography variant="body2">
                                                {edit.previousContent}
                                            </Typography>
                                        </Paper>
                                        {edit.editReason && (
                                            <>
                                                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                                    Edit Reason:
                                                </Typography>
                                                <Typography variant="body2" fontStyle="italic">
                                                    {edit.editReason}
                                                </Typography>
                                            </>
                                        )}
                                    </CardContent>
                                </Card>
                                ))}
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setHistoryDialogOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* ✅ Quote Reply Dialog */}
            <Dialog
                open={quoteReplyDialogOpen}
                onClose={() => !addingQuoteReply && setQuoteReplyDialogOpen(false)}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Box display="flex" alignItems="center" gap={1}>
                            <FormatQuote />
                            <Typography variant="h6">Quote Reply</Typography>
                        </Box>
                        <IconButton onClick={() => setQuoteReplyDialogOpen(false)} disabled={addingQuoteReply}>
                            <Close />
                        </IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ px: { xs: 2, sm: 3 }, pt: 2 }}>
                    {/* Quoted Comment */}
                    <Paper 
                        elevation={0}
                        sx={{ 
                            p: 2,
                            mb: 2,
                            bgcolor: 'background.default',
                            borderLeft: '4px solid',
                            borderColor: 'primary.main'
                        }}
                    >
                        <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
                            <Typography variant="caption" fontWeight="bold">
                                {selectedComment?.createdBy?.userName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                ({selectedComment?.createdBy?.userRole})
                            </Typography>
                        </Box>
                        <Typography variant="body2" fontStyle="italic">
                            {selectedComment?.comment}
                        </Typography>
                    </Paper>
                    
                    {/* Reply Content */}
                    <TextField
                        fullWidth
                        multiline
                        rows={6}
                        label="Your Reply"
                        placeholder="Write your reply... Use @FirstName LastName to mention someone"
                        value={quoteReplyContent}
                        onChange={(e) => setQuoteReplyContent(e.target.value)}
                        disabled={addingQuoteReply}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setQuoteReplyDialogOpen(false)} disabled={addingQuoteReply}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleQuoteReplySubmit}
                        disabled={addingQuoteReply || !quoteReplyContent.trim()}
                        startIcon={addingQuoteReply ? <CircularProgress size={20} /> : <Send />}
                    >
                        {addingQuoteReply ? 'Sending...' : 'Send Reply'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete Call Confirmation Dialog */}
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
                    <Typography>
                        {deleteCallConfirm === 'all' 
                            ? `Are you sure you want to delete all ${callHistory.length} call(s) for this lead? This action cannot be undone.`
                            : 'Are you sure you want to delete this call? This action cannot be undone.'}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteCallConfirm(null)} disabled={deletingCall}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={() => {
                            if (deleteCallConfirm === 'all') {
                                handleDeleteAllCalls();
                            } else {
                                handleDeleteCall(deleteCallConfirm);
                            }
                        }}
                        disabled={deletingCall}
                        startIcon={deletingCall ? <CircularProgress size={20} /> : <DeleteIcon />}
                    >
                        {deletingCall ? 'Deleting...' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ✅ Nested Reply Dialog */}
            <Dialog
                open={nestedReplyDialogOpen}
                onClose={() => !addingNestedReply && setNestedReplyDialogOpen(false)}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Box display="flex" alignItems="center" gap={1}>
                            <Reply />
                            <Typography variant="h6">Reply to Comment</Typography>
                        </Box>
                        <IconButton onClick={() => setNestedReplyDialogOpen(false)} disabled={addingNestedReply}>
                            <Close />
                        </IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ px: { xs: 2, sm: 3 }, pt: 2 }}>
                    {/* Original Comment */}
                    <Box sx={{ mb: 2 }}>
                        <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                            Replying to:
                        </Typography>
                        <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <Avatar sx={{ width: 24, height: 24, fontSize: '0.7rem' }}>
                                    {selectedComment?.createdBy?.userName?.split(' ').map(n => n[0]).join('').toUpperCase()}
                                </Avatar>
                                <Typography variant="caption" fontWeight="bold">
                                    {selectedComment?.createdBy?.userName}
                                </Typography>
                            </Box>
                            <Typography variant="body2">
                                {selectedComment?.comment}
                            </Typography>
                        </Paper>
                    </Box>
                    
                    {/* Reply Content */}
                    <TextField
                        fullWidth
                        multiline
                        rows={6}
                        label="Your Reply"
                        placeholder="Write your reply... Use @FirstName LastName to mention someone"
                        value={nestedReplyContent}
                        onChange={(e) => setNestedReplyContent(e.target.value)}
                        disabled={addingNestedReply}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setNestedReplyDialogOpen(false)} disabled={addingNestedReply}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleNestedReplySubmit}
                        disabled={addingNestedReply || !nestedReplyContent.trim()}
                        startIcon={addingNestedReply ? <CircularProgress size={20} /> : <Send />}
                    >
                        {addingNestedReply ? 'Sending...' : 'Send Reply'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ✅ Likes Dialog */}
            <Dialog
                open={likesDialogOpen}
                onClose={() => setLikesDialogOpen(false)}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Box display="flex" alignItems="center" gap={1}>
                            <ThumbUp color="primary" />
                            <Typography variant="h6">Likes ({selectedLikes.length})</Typography>
                        </Box>
                        <IconButton onClick={() => setLikesDialogOpen(false)}>
                            <Close />
                        </IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
                    {selectedLikes.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
                            No likes yet
                        </Typography>
                    ) : (
                        <Stack spacing={1.5}>
                            {selectedLikes.map((like, index) => (
                                <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Avatar sx={{ width: 40, height: 40, fontSize: '0.875rem' }}>
                                        {like.userName?.split(' ').map(n => n[0]).join('').toUpperCase()}
                                    </Avatar>
                                    <Box sx={{ flex: 1 }}>
                                        <Typography variant="subtitle2" fontWeight="bold">
                                            {like.userName}
                                        </Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Chip label={like.userRole} size="small" sx={{ height: 18, fontSize: '0.7rem' }} />
                                            <Typography variant="caption" color="text.secondary">
                                                {formatDateTime(like.likedAt)}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Box>
                            ))}
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setLikesDialogOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
            {canViewCallLogs && (
                <CallLogsModal
                    callId={logsCallId}
                    open={logsModalOpen}
                    onClose={() => {
                        setLogsModalOpen(false);
                        setLogsCallId(null);
                    }}
                    canViewCallRecordings={canViewCallRecordings}
                />
            )}

            <ReminderModal
                open={reminderModalOpen}
                onClose={() => {
                    setReminderModalOpen(false);
                    setEditingReminder(null);
                }}
                leadId={leadId}
                leadName={`${lead?.firstName || ''} ${lead?.lastName || ''}`.trim() || lead?.email || 'Lead'}
                reminder={editingReminder}
                onSaved={fetchReminders}
            />
            </Box>
        </Box>
    );
};

export default LeadStream;
