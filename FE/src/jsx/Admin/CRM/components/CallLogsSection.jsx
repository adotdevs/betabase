import React, { useState, useCallback, useEffect } from 'react';
import { Box, Stack, Typography, Paper, Chip, Accordion, AccordionSummary, AccordionDetails, CircularProgress } from '@mui/material';
import { ExpandMore, SmartToy, Cancel } from '@mui/icons-material';
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

const CallLogsSection = ({ callId }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState(false);
    const [callDetails, setCallDetails] = useState(null);

    const fetchLogs = useCallback(async () => {
        if (!expanded || logs.length > 0) return; // Only fetch once when expanded
        
        setLoading(true);
        setError(null);
        try {
            // OPTIMIZATION: Use stored logs by default (no Vapi API call)
            // Only fetch from Vapi API if explicitly needed (fetchFromVapi: 'true')
            // This prevents unnecessary API calls and rate limits
            const response = await getCallLogsApi(callId, { fetchFromVapi: 'false' });
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
    }, [callId, expanded, logs.length]);

    useEffect(() => {
        if (expanded) {
            fetchLogs();
        }
    }, [expanded, fetchLogs]);

    return (
        <Accordion
            expanded={expanded}
            onChange={(e, isExpanded) => setExpanded(isExpanded)}
            sx={{ mt: 2 }}
        >
            <AccordionSummary
                expandIcon={<ExpandMore />}
                sx={{
                    bgcolor: 'primary.light',
                    borderRadius: 1,
                    '&:hover': {
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                    },
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                    <SmartToy color="inherit" />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Vapi AI Call Logs
                    </Typography>
                    {logs.length > 0 && (
                        <Chip label={logs.length} size="small" sx={{ ml: 'auto' }} />
                    )}
                </Box>
            </AccordionSummary>
            <AccordionDetails>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : error ? (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                        <Cancel color="error" sx={{ fontSize: 48, mb: 1 }} />
                        <Typography variant="body2" color="error">
                            {error}
                        </Typography>
                        {callDetails?.endedReason && (
                            <Box sx={{ mt: 2, p: 2, bgcolor: 'warning.light', borderRadius: 1 }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                                    ENDED REASON (from stored data):
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: 'warning.dark' }}>
                                    {callDetails.endedReason}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                ) : logs.length === 0 ? (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            No detailed logs available for this call
                        </Typography>
                        {callDetails?.endedReason && (
                            <Box sx={{ mt: 2, p: 2, bgcolor: 'warning.light', borderRadius: 1, border: '1px solid', borderColor: 'warning.main' }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                                    ENDED REASON:
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: 'warning.dark' }}>
                                    {callDetails.endedReason}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                ) : (
                    <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                        <Stack spacing={1}>
                            {logs.map((log, index) => {
                                const logType = log.type || 'message';
                                const isError = logType === 'error';
                                const isStatus = logType === 'status' || logType === 'call_started';
                                const isEnded = logType === 'ended';
                                const isUser = log.role === 'user';
                                const isTranscript = logType === 'transcript' || logType === 'transcript_message';
                                const isSummary = logType === 'summary';
                                const isCost = logType === 'cost';
                                const isMetadata = logType === 'metadata';
                                const isWebhook = logType === 'webhook';

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
                                        <Box
                                            sx={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'flex-start',
                                                mb: 0.5,
                                            }}
                                        >
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
                                        {log.data &&
                                            typeof log.data === 'object' &&
                                            Object.keys(log.data).length > 0 && (
                                                <Box
                                                    sx={{
                                                        mt: 1,
                                                        p: 1.5,
                                                        bgcolor: 'background.default',
                                                        borderRadius: 0.5,
                                                        border: '1px solid',
                                                        borderColor: 'divider'
                                                    }}
                                                >
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
                                                    {isWebhook && log.data.fullPayload && (
                                                        <Box sx={{ mb: 1 }}>
                                                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                                                                WEBHOOK TYPE:
                                                            </Typography>
                                                            <Chip 
                                                                label={log.data.webhookType || 'unknown'} 
                                                                size="small" 
                                                                color="info" 
                                                                sx={{ mb: 1 }}
                                                            />
                                                            {log.data.endedReason && (
                                                                <Box sx={{ mb: 1 }}>
                                                                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                                                                        ENDED REASON:
                                                                    </Typography>
                                                                    <Chip 
                                                                        label={log.data.endedReason} 
                                                                        size="small" 
                                                                        color="warning" 
                                                                    />
                                                                </Box>
                                                            )}
                                                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5, mt: 1 }}>
                                                                FULL WEBHOOK PAYLOAD:
                                                            </Typography>
                                                            <Box
                                                                sx={{
                                                                    p: 1.5,
                                                                    bgcolor: 'background.default',
                                                                    borderRadius: 0.5,
                                                                    border: '1px solid',
                                                                    borderColor: 'divider',
                                                                    maxHeight: 400,
                                                                    overflow: 'auto'
                                                                }}
                                                            >
                                                                <Typography
                                                                    variant="caption"
                                                                    sx={{
                                                                        fontFamily: 'monospace',
                                                                        whiteSpace: 'pre-wrap',
                                                                        fontSize: '0.7rem',
                                                                        display: 'block'
                                                                    }}
                                                                >
                                                                    {JSON.stringify(log.data.fullPayload, null, 2)}
                                                                </Typography>
                                                            </Box>
                                                        </Box>
                                                    )}
                                                    {!isWebhook && (
                                                        <Typography
                                                            variant="caption"
                                                            color="text.secondary"
                                                            sx={{
                                                                fontFamily: 'monospace',
                                                                whiteSpace: 'pre-wrap',
                                                                fontSize: '0.7rem',
                                                            }}
                                                        >
                                                            {JSON.stringify(log.data, null, 2)}
                                                        </Typography>
                                                    )}
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
    );
};

export default CallLogsSection;

