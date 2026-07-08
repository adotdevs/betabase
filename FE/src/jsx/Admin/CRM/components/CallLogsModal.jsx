import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Stack,
    Typography,
    Paper,
    Chip,
    CircularProgress,
    IconButton,
    Grid,
} from '@mui/material';
import { Close, SmartToy, Cancel } from '@mui/icons-material';
import { getCallLogsApi } from '../../../../Api/Service';

const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};

const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${String(secs).padStart(2, '0')}`;
};

const CallLogsModal = ({ open, onClose, callId }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [callDetails, setCallDetails] = useState(null);

    const fetchLogs = useCallback(async () => {
        if (!open || !callId) return;
        
        // Prevent multiple simultaneous fetches
        if (loading) return;

        setLoading(true);
        setError(null);
        try {
            const start = performance.now();
            // CRITICAL: Fetch detailed logs from Vapi API when modal is opened
            // This is user-initiated, so it's acceptable to fetch fresh data
            // Use fetchFromVapi: 'true' to get detailed Vapi logs
            const response = await getCallLogsApi(callId, { light: 'false', maxLogs: 500, fetchFromVapi: 'true' });
            const durationMs = performance.now() - start;

            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: 'debug-session',
                    runId: 'calllogs',
                    hypothesisId: 'PERF1',
                    location: 'CallLogsModal.jsx:fetchLogs',
                    message: 'Call logs API timing',
                    data: {
                        callId,
                        durationMs,
                        success: !!response?.success,
                        logsLength: Array.isArray(response?.logs) ? response.logs.length : 0,
                    },
                    timestamp: Date.now()
                })
            }).catch(() => {});
            // #endregion agent log

            if (response.success) {
                const fetchedLogs = response.logs || [];
                setLogs(fetchedLogs);
                setCallDetails(response.callDetails || null);
                
                // If no logs but we have endedReason in callDetails, create a log entry
                if (fetchedLogs.length === 0 && response.callDetails?.endedReason) {
                    setLogs([{
                        type: 'ended',
                        timestamp: response.callDetails.endedAt || new Date(),
                        message: `Call ended: ${response.callDetails.endedReason}`,
                        data: {
                            endedReason: response.callDetails.endedReason,
                            endedAt: response.callDetails.endedAt,
                            duration: response.callDetails.duration,
                            note: 'This information was retrieved from call metadata.'
                        }
                    }]);
                }
            } else {
                // Don't set error for permission issues - just show empty state to prevent infinite loops
                const isPermissionError = response.message?.toLowerCase().includes('permission') || 
                                         response.message?.toLowerCase().includes('unauthorized');
                if (!isPermissionError) {
                    setError(response.message || 'Failed to load logs');
                }
            }
        } catch (err) {
            // Don't set error for permission issues - just show empty state to prevent infinite loops
            const isPermissionError = err.message?.toLowerCase().includes('permission') || 
                                     err.message?.toLowerCase().includes('unauthorized') ||
                                     err.response?.data?.message?.toLowerCase().includes('permission') ||
                                     err.response?.status === 403;
            if (!isPermissionError) {
                console.error('Error fetching call logs:', err);
                setError(err.message || 'Failed to load logs');
            }
        } finally {
            setLoading(false);
        }
    }, [callId, open, loading]); // Added loading to prevent concurrent fetches

    useEffect(() => {
        if (!open || !callId) {
            setLogs([]);
            setCallDetails(null);
            setError(null);
            return;
        }

        // Only fetch if not already loading
        if (!loading) {
            setLogs([]);
            setCallDetails(null);
            setError(null);
            fetchLogs();
        }
    }, [open, callId]); // Removed fetchLogs and loading from deps to prevent infinite loops

    const resolvedDetails = useMemo(() => {
        if (!callDetails) return null;
        const metadata = callDetails.metadata || {};
        const webhookPayload = callDetails.webhookPayload || metadata.vapiWebhookPayload || callDetails.vapiWebhookPayload || {};
        const messagePayload = webhookPayload.message || {};
        const nestedCall = webhookPayload.call || messagePayload.call || {};
        const endedReason = callDetails.endedReason ||
            metadata.vapiEndedReason ||
            metadata.endedReason ||
            webhookPayload.endedReason ||
            messagePayload.endedReason ||
            nestedCall.endedReason ||
            callDetails.status ||
            null;
        const startedAt = callDetails.startedAt ||
            metadata.startedAt ||
            webhookPayload.startedAt ||
            messagePayload.startedAt ||
            nestedCall.startedAt ||
            nestedCall.createdAt ||
            callDetails.createdAt ||
            null;
        const endedAt = callDetails.endedAt ||
            metadata.endedAt ||
            webhookPayload.endedAt ||
            messagePayload.endedAt ||
            nestedCall.endedAt ||
            nestedCall.updatedAt ||
            callDetails.endedAt ||
            null;
        const durationSeconds = callDetails.duration ??
            metadata.vapiDuration ??
            webhookPayload.durationSeconds ??
            webhookPayload.duration ??
            nestedCall.duration ??
            0;
        const status = callDetails.status || callDetails.vapiStatus || metadata.vapiStatus || nestedCall.status || messagePayload.status || null;
        const cost = callDetails.cost ??
            webhookPayload.cost ??
            webhookPayload.costBreakdown?.total ??
            nestedCall.cost ??
            null;
        const phoneNumber = callDetails.phoneNumber ||
            callDetails.phone ||
            callDetails.customerNumber ||
            nestedCall.customer?.number ||
            metadata.leadInfo?.phone ||
            null;
        
        // Extract structured outputs from multiple possible locations
        const structuredOutputs = callDetails.structuredOutputs ||
                                 metadata.structuredOutputs ||
                                 webhookPayload.message?.artifact?.structuredOutputs ||
                                 webhookPayload.artifact?.structuredOutputs ||
                                 callDetails.artifact?.structuredOutputs ||
                                 null;
        
        return {
            endedReason,
            startedAt,
            endedAt,
            durationSeconds,
            status,
            cost,
            phoneNumber,
            structuredOutputs,
        };
    }, [callDetails]);

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="lg"
            fullWidth
            PaperProps={{
                sx: {
                    maxHeight: '95vh',
                    height: '95vh',
                    display: 'flex',
                    flexDirection: 'column'
                }
            }}
        >
            <DialogTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SmartToy color="primary" />
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            Vapi AI Call Logs
                        </Typography>
                        {logs.length > 0 && (
                            <Chip label={logs.length} size="small" color="primary" />
                        )}
                    </Box>
                    <IconButton
                        onClick={onClose}
                        size="small"
                        sx={{ color: 'text.secondary' }}
                    >
                        <Close />
                    </IconButton>
                </Box>
            </DialogTitle>
            <DialogContent 
                dividers 
                sx={{ 
                    p: 0, 
                    flex: 1, 
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8, flex: 1 }}>
                        <CircularProgress />
                    </Box>
                ) : error ? (
                    <Box sx={{ p: 4, textAlign: 'center', flex: 1, overflow: 'auto' }}>
                        <Cancel color="error" sx={{ fontSize: 64, mb: 2 }} />
                        <Typography variant="h6" color="error" gutterBottom>
                            {error}
                        </Typography>
                        {callDetails?.endedReason && (
                            <Box sx={{ mt: 3, p: 2, bgcolor: 'warning.light', borderRadius: 1, maxWidth: 600, mx: 'auto' }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                                    Ended Reason (from stored data):
                                </Typography>
                                <Typography variant="body1" sx={{ fontWeight: 600, color: 'warning.dark' }}>
                                    {callDetails.endedReason}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                ) : logs.length === 0 ? (
                    <Box sx={{ p: 4, textAlign: 'center', flex: 1, overflow: 'auto' }}>
                        <Typography variant="h6" color="text.secondary" gutterBottom>
                            No detailed logs available for this call
                        </Typography>
                        {callDetails?.endedReason && (
                            <Box sx={{ mt: 3, p: 2, bgcolor: 'warning.light', borderRadius: 1, border: '1px solid', borderColor: 'warning.main', maxWidth: 600, mx: 'auto' }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                                    Ended Reason:
                                </Typography>
                                <Typography variant="body1" sx={{ fontWeight: 600, color: 'warning.dark' }}>
                                    {callDetails.endedReason}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                ) : (
                    <Box sx={{ 
                        p: 3, 
                        flex: 1, 
                        overflow: 'auto',
                        minHeight: 0
                    }}>
                        <Stack spacing={2}>
                            {resolvedDetails && (
                                <Paper
                                    elevation={2}
                                    sx={{
                                        p: 3,
                                        bgcolor: 'background.default',
                                        borderLeft: '4px solid',
                                        borderColor: 'primary.main'
                                    }}
                                >
                                    <Typography variant="overline" color="text.secondary">
                                        Call Summary
                                    </Typography>
                                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                                        {resolvedDetails.endedReason && (
                                            <Chip
                                                label={resolvedDetails.endedReason}
                                                color="warning"
                                                sx={{ fontWeight: 700 }}
                                            />
                                        )}
                                        {resolvedDetails.status && (
                                            <Chip
                                                label={`Status: ${resolvedDetails.status}`}
                                                color="primary"
                                                variant="outlined"
                                                sx={{ fontWeight: 600 }}
                                            />
                                        )}
                                    </Stack>
                                    <Grid container spacing={2} sx={{ mt: 2 }}>
                                        <Grid item xs={12} sm={6} md={3}>
                                            <Typography variant="caption" color="text.secondary">
                                                Phone
                                            </Typography>
                                            <Typography variant="body1" fontWeight={600}>
                                                {resolvedDetails.phoneNumber || 'N/A'}
                                            </Typography>
                                        </Grid>
                                        <Grid item xs={12} sm={6} md={3}>
                                            <Typography variant="caption" color="text.secondary">
                                                Started At
                                            </Typography>
                                            <Typography variant="body1" fontWeight={600}>
                                                {formatDateTime(resolvedDetails.startedAt)}
                                            </Typography>
                                        </Grid>
                                        <Grid item xs={12} sm={6} md={3}>
                                            <Typography variant="caption" color="text.secondary">
                                                Ended At
                                            </Typography>
                                            <Typography variant="body1" fontWeight={600}>
                                                {formatDateTime(resolvedDetails.endedAt)}
                                            </Typography>
                                        </Grid>
                                        <Grid item xs={12} sm={6} md={3}>
                                            <Typography variant="caption" color="text.secondary">
                                                Duration
                                            </Typography>
                                            <Typography variant="body1" fontWeight={600}>
                                                {formatDuration(resolvedDetails.durationSeconds)}
                                            </Typography>
                                        </Grid>
                                        {resolvedDetails.cost != null && (
                                            <Grid item xs={12} sm={6} md={3}>
                                                <Typography variant="caption" color="text.secondary">
                                                    Cost
                                                </Typography>
                                                <Typography variant="body1" fontWeight={600}>
                                                    ${Number(resolvedDetails.cost).toFixed(4)}
                                                </Typography>
                                            </Grid>
                                        )}
                                    </Grid>
                                    {resolvedDetails.structuredOutputs && Object.keys(resolvedDetails.structuredOutputs).length > 0 && (
                                        <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                                            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1.5 }}>
                                                Structured Outputs
                                            </Typography>
                                            <Stack spacing={1.5}>
                                                {Object.entries(resolvedDetails.structuredOutputs).map(([key, output]) => (
                                                    <Paper
                                                        key={key}
                                                        elevation={1}
                                                        sx={{
                                                            p: 2,
                                                            borderRadius: 1,
                                                            borderLeft: '4px solid',
                                                            borderColor: 'primary.main',
                                                            bgcolor: 'background.paper'
                                                        }}
                                                    >
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                                                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                                {output.name || 'Structured Output'}
                                                            </Typography>
                                                            {typeof output.result === 'boolean' ? (
                                                                <Chip
                                                                    label={output.result ? 'Yes' : 'No'}
                                                                    color={output.result ? 'success' : 'error'}
                                                                    size="small"
                                                                    sx={{ fontWeight: 600 }}
                                                                />
                                                            ) : typeof output.result === 'string' && output.result.length <= 50 ? (
                                                                <Chip
                                                                    label={output.result}
                                                                    color="default"
                                                                    size="small"
                                                                    sx={{ fontWeight: 600 }}
                                                                />
                                                            ) : null}
                                                        </Box>
                                                        {typeof output.result === 'string' && output.result.length > 50 && (
                                                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                                                                {output.result}
                                                            </Typography>
                                                        )}
                                                        {typeof output.result !== 'boolean' && typeof output.result !== 'string' && (
                                                            <Typography
                                                                variant="caption"
                                                                sx={{
                                                                    fontFamily: 'monospace',
                                                                    whiteSpace: 'pre-wrap',
                                                                    fontSize: '0.75rem',
                                                                    color: 'text.secondary',
                                                                    display: 'block',
                                                                    bgcolor: 'background.default',
                                                                    p: 1.5,
                                                                    borderRadius: 1,
                                                                    mt: 1
                                                                }}
                                                            >
                                                                {JSON.stringify(output.result, null, 2)}
                                                            </Typography>
                                                        )}
                                                        {/* Display other properties like compliancePlan */}
                                                        {Object.keys(output).filter(k => k !== 'name' && k !== 'result').map(propKey => (
                                                            <Box key={propKey} sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}>
                                                                <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5, textTransform: 'capitalize' }}>
                                                                    {propKey.replace(/([A-Z])/g, ' $1').trim()}:
                                                                </Typography>
                                                                <Typography
                                                                    variant="body2"
                                                                    sx={{
                                                                        whiteSpace: 'pre-wrap',
                                                                        fontFamily: typeof output[propKey] === 'object' ? 'monospace' : 'inherit',
                                                                        bgcolor: typeof output[propKey] === 'object' ? 'background.default' : 'transparent',
                                                                        p: typeof output[propKey] === 'object' ? 1 : 0,
                                                                        borderRadius: typeof output[propKey] === 'object' ? 1 : 0
                                                                    }}
                                                                >
                                                                    {typeof output[propKey] === 'object' ? JSON.stringify(output[propKey], null, 2) : String(output[propKey])}
                                                                </Typography>
                                                            </Box>
                                                        ))}
                                                    </Paper>
                                                ))}
                                            </Stack>
                                        </Box>
                                    )}
                                </Paper>
                            )}
                            {logs.map((log, index) => {
                                const logType = log.type || 'message';
                                const isError = logType === 'error';
                                const isStatus = logType === 'status' || logType === 'call_started' || logType === 'status-update';
                                const isEnded = logType === 'ended' || logType === 'end-of-call-report';
                                const isUser = log.role === 'user';
                                const isTranscript = logType === 'transcript' || logType === 'transcript_message';
                                const isSummary = logType === 'summary';
                                const isCost = logType === 'cost';
                                const isMetadata = logType === 'metadata';
                                const isWebhook = logType === 'webhook' || logType === 'status-update' || logType === 'end-of-call-report';

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
                                } else if (isWebhook) {
                                    borderColor = 'info.main';
                                    bgColor = 'info.light';
                                    chipColor = 'info';
                                }

                                return (
                                    <Paper
                                        key={index}
                                        elevation={isEnded ? 3 : 1}
                                        sx={{
                                            p: isEnded ? 2.5 : 2,
                                            borderRadius: 2,
                                            borderLeft: '4px solid',
                                            borderColor: borderColor,
                                            bgcolor: bgColor,
                                            ...(isEnded && {
                                                boxShadow: 4,
                                                border: '2px solid',
                                                borderColor: borderColor,
                                            })
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'flex-start',
                                                mb: 1,
                                            }}
                                        >
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                <Chip
                                                    label={logType.replace('_', ' ').toUpperCase()}
                                                    size="small"
                                                    color={chipColor}
                                                    sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                                                />
                                                {log.role && (
                                                    <Chip
                                                        label={log.role === 'user' ? 'User' : log.role === 'assistant' ? 'Assistant' : log.role}
                                                        size="small"
                                                        color={log.role === 'user' ? 'success' : 'primary'}
                                                        sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                                                    />
                                                )}
                                                {isEnded && log.data?.endedReason && (
                                                    <Chip
                                                        label={log.data.endedReason.toUpperCase()}
                                                        size="small"
                                                        color="warning"
                                                        sx={{ 
                                                            fontWeight: 700, 
                                                            fontSize: '0.8rem',
                                                            height: 28,
                                                            boxShadow: 2
                                                        }}
                                                    />
                                                )}
                                            </Box>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                                {formatDateTime(log.timestamp || log.data?.timestamp || log.createdAt || log.data?.endedAt || log.data?.startedAt)}
                                            </Typography>
                                        </Box>
                                        {log.message && (
                                            <Typography
                                                variant={isEnded ? "body1" : "body2"}
                                                sx={{ 
                                                    fontWeight: isEnded ? 700 : 600, 
                                                    mb: log.data && Object.keys(log.data).length > 0 ? 1.5 : 0,
                                                    color: isEnded ? 'warning.dark' : 'text.primary'
                                                }}
                                            >
                                                {log.message}
                                            </Typography>
                                        )}
                                        {log.data &&
                                            typeof log.data === 'object' &&
                                            Object.keys(log.data).length > 0 && (
                                                <Box
                                                    sx={{
                                                        mt: log.message ? 1.5 : 0,
                                                        p: 2,
                                                        bgcolor: 'background.default',
                                                        borderRadius: 1,
                                                        border: '1px solid',
                                                        borderColor: 'divider'
                                                    }}
                                                >
                                                    {/* Only show endedReason once if it's already in the message */}
                                                    {isEnded && log.data.endedReason && !log.message?.includes(log.data.endedReason) && (
                                                        <Box sx={{ mb: 1.5, p: 1.5, bgcolor: 'warning.light', borderRadius: 1 }}>
                                                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                                                                Ended Reason:
                                                            </Typography>
                                                            <Typography variant="body1" sx={{ fontWeight: 600, color: 'warning.dark' }}>
                                                                {log.data.endedReason}
                                                            </Typography>
                                                        </Box>
                                                    )}
                                                    {isTranscript && log.data.transcript && (
                                                        <Box sx={{ mb: 1.5 }}>
                                                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5, color: 'text.primary' }}>
                                                                Transcript:
                                                            </Typography>
                                                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontStyle: 'italic', color: 'text.primary', bgcolor: 'background.paper', p: 1.5, borderRadius: 1 }}>
                                                                {typeof log.data.transcript === 'string' ? log.data.transcript : JSON.stringify(log.data.transcript)}
                                                            </Typography>
                                                        </Box>
                                                    )}
                                                    {isSummary && log.data.summary && (
                                                        <Box sx={{ mb: 1.5 }}>
                                                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5, color: 'text.primary' }}>
                                                                Summary:
                                                            </Typography>
                                                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: 'text.primary', bgcolor: 'background.paper', p: 1.5, borderRadius: 1 }}>
                                                                {log.data.summary}
                                                            </Typography>
                                                        </Box>
                                                    )}
                                                    {log.data.content && (
                                                        <Box sx={{ mb: 1.5 }}>
                                                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5, color: 'text.primary' }}>
                                                                Content:
                                                            </Typography>
                                                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: 'text.primary', bgcolor: 'background.paper', p: 1.5, borderRadius: 1 }}>
                                                                {typeof log.data.content === 'string' ? log.data.content : JSON.stringify(log.data.content)}
                                                            </Typography>
                                                        </Box>
                                                    )}
                                                    {log.data.text && (
                                                        <Box sx={{ mb: 1.5 }}>
                                                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5, color: 'text.primary' }}>
                                                                Text:
                                                            </Typography>
                                                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: 'text.primary', bgcolor: 'background.paper', p: 1.5, borderRadius: 1 }}>
                                                                {typeof log.data.text === 'string' ? log.data.text : JSON.stringify(log.data.text)}
                                                            </Typography>
                                                        </Box>
                                                    )}
                                                    {log.data.error && (
                                                        <Box sx={{ mb: 1.5, p: 1.5, bgcolor: 'error.light', borderRadius: 1 }}>
                                                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5, color: 'error.dark' }}>
                                                                Error:
                                                            </Typography>
                                                            <Typography variant="body2" sx={{ color: 'error.dark', fontWeight: 600 }}>
                                                                {typeof log.data.error === 'string' ? log.data.error : JSON.stringify(log.data.error)}
                                                            </Typography>
                                                        </Box>
                                                    )}
                                                    {isWebhook && log.data.fullPayload && (
                                                        <Box sx={{ mb: 1.5 }}>
                                                            {log.data.webhookType && (
                                                                <Box sx={{ mb: 1.5 }}>
                                                                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5, color: 'text.primary' }}>
                                                                        Webhook Type:
                                                                    </Typography>
                                                                    <Chip 
                                                                        label={log.data.webhookType} 
                                                                        size="small" 
                                                                        color="info" 
                                                                    />
                                                                </Box>
                                                            )}
                                                            {log.data.endedReason && !log.message?.includes(log.data.endedReason) && (
                                                                <Box sx={{ mb: 1.5, p: 1.5, bgcolor: 'warning.light', borderRadius: 1 }}>
                                                                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5, color: 'warning.dark' }}>
                                                                        Ended Reason:
                                                                    </Typography>
                                                                    <Chip 
                                                                        label={log.data.endedReason} 
                                                                        size="small" 
                                                                        color="warning" 
                                                                    />
                                                                </Box>
                                                            )}
                                                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5, mt: 1.5, color: 'text.primary' }}>
                                                                Full Payload:
                                                            </Typography>
                                                            <Box
                                                                sx={{
                                                                    p: 2,
                                                                    bgcolor: 'background.paper',
                                                                    borderRadius: 1,
                                                                    border: '1px solid',
                                                                    borderColor: 'divider',
                                                                    maxHeight: 300,
                                                                    overflow: 'auto'
                                                                }}
                                                            >
                                                                <Typography
                                                                    variant="caption"
                                                                    sx={{
                                                                        fontFamily: 'monospace',
                                                                        whiteSpace: 'pre-wrap',
                                                                        fontSize: '0.7rem',
                                                                        display: 'block',
                                                                        color: 'text.primary'
                                                                    }}
                                                                >
                                                                    {JSON.stringify(log.data.fullPayload, null, 2)}
                                                                </Typography>
                                                            </Box>
                                                        </Box>
                                                    )}
                                                    {/* Show additional data fields that aren't already displayed */}
                                                    {!isWebhook && !isTranscript && !isSummary && !log.data.endedReason && !log.data.content && !log.data.text && !log.data.error && (
                                                        <Box>
                                                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5, color: 'text.primary' }}>
                                                                Additional Data:
                                                            </Typography>
                                                            <Typography
                                                                variant="caption"
                                                                sx={{
                                                                    fontFamily: 'monospace',
                                                                    whiteSpace: 'pre-wrap',
                                                                    fontSize: '0.75rem',
                                                                    color: 'text.secondary',
                                                                    display: 'block',
                                                                    bgcolor: 'background.paper',
                                                                    p: 1.5,
                                                                    borderRadius: 1
                                                                }}
                                                            >
                                                                {JSON.stringify(log.data, null, 2)}
                                                            </Typography>
                                                        </Box>
                                                    )}
                                                </Box>
                                            )}
                                    </Paper>
                                );
                            })}
                        </Stack>
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} variant="contained" color="primary">
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default CallLogsModal;
