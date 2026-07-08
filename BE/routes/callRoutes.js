// routes/callRoutes.js
const express = require('express');
const router = express.Router();
const {
    initiateCall,
    bulkCallLeads,
    scheduleCall,
    getCallStatus,
    getCallHistory,
    cancelCall,
    receiveCallSummary,
    getCallStatistics,
    getActiveCalls,
    getCallQueueStatus,
    updateCallStatus,
    pauseCallQueue,
    resumeCallQueue,
    retryFailedCall,
    getCompletedCalls,
    deleteCall,
    callUpdatesSSE,
    getCallLogs
} = require('../controllers/callController');
const { handleVapiWebhook } = require('../controllers/vapiWebhookController');
const { isAuthorizedUser, authorizedRoles, checkCrmAccess } = require('../middlewares/auth');

// Manual call initiation
router.post('/crm/call/initiate', isAuthorizedUser, authorizedRoles('superadmin', 'admin', 'subadmin'), checkCrmAccess, initiateCall);

// Bulk automatic calls
router.post('/crm/call/bulk', isAuthorizedUser, authorizedRoles('superadmin', 'admin'), checkCrmAccess, bulkCallLeads);

// Schedule call
router.post('/crm/call/schedule', isAuthorizedUser, authorizedRoles('superadmin', 'admin', 'subadmin'), checkCrmAccess, scheduleCall);

// Get call status
router.get('/crm/call/status/:sessionId', isAuthorizedUser, authorizedRoles('superadmin', 'admin', 'subadmin'), checkCrmAccess, getCallStatus);

// Get call history for a lead
router.get('/crm/call/history/:leadId', isAuthorizedUser, authorizedRoles('superadmin', 'admin', 'subadmin'), checkCrmAccess, getCallHistory);

// Cancel call
router.post('/crm/call/cancel/:sessionId', isAuthorizedUser, authorizedRoles('superadmin', 'admin', 'subadmin'), checkCrmAccess, cancelCall);

// Webhook for call summary (called by VoIP bot - no auth required for internal use)
router.post('/crm/call/summary', receiveCallSummary);

// Vapi Webhook - Source of Truth for Call Lifecycle Events
// No auth required - Vapi will call this endpoint with webhook events
// This is the AUTHORITATIVE source for call status, endedReason, duration, transcript, etc.
router.post('/webhooks/vapi', handleVapiWebhook);

// Get call statistics
router.get('/crm/call/statistics', isAuthorizedUser, authorizedRoles('superadmin', 'admin', 'subadmin'), checkCrmAccess, getCallStatistics);

// Get active calls
router.get('/crm/call/active', isAuthorizedUser, authorizedRoles('superadmin', 'admin', 'subadmin'), checkCrmAccess, getActiveCalls);

// Server-Sent Events for real-time call updates
// Note: SSE endpoint uses origin-based security since EventSource doesn't support auth headers
router.get('/crm/call/updates/sse', callUpdatesSSE);

// Get call queue status
router.get('/crm/call/queue/status', isAuthorizedUser, authorizedRoles('superadmin', 'admin', 'subadmin'), checkCrmAccess, getCallQueueStatus);

// Update call status (internal use by VoIP agent)
router.post('/crm/call/update-status', updateCallStatus);

// Pause/Resume call queue
router.post('/crm/call/queue/pause', isAuthorizedUser, authorizedRoles('superadmin', 'admin'), checkCrmAccess, pauseCallQueue);
router.post('/crm/call/queue/resume', isAuthorizedUser, authorizedRoles('superadmin', 'admin'), checkCrmAccess, resumeCallQueue);

// Retry failed call
router.post('/crm/call/retry', isAuthorizedUser, authorizedRoles('superadmin', 'admin', 'subadmin'), checkCrmAccess, retryFailedCall);

// Get completed calls
router.get('/crm/call/completed', isAuthorizedUser, authorizedRoles('superadmin', 'admin', 'subadmin'), checkCrmAccess, getCompletedCalls);

// Delete call(s)
router.delete('/crm/call/:callId', isAuthorizedUser, authorizedRoles('superadmin', 'admin', 'subadmin'), checkCrmAccess, deleteCall);
router.delete('/crm/call', isAuthorizedUser, authorizedRoles('superadmin', 'admin', 'subadmin'), checkCrmAccess, deleteCall);

// Get Vapi call logs
router.get('/crm/call/:callId/logs', isAuthorizedUser, authorizedRoles('superadmin', 'admin', 'subadmin'), checkCrmAccess, getCallLogs);

module.exports = router;

