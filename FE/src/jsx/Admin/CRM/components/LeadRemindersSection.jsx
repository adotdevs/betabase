import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Stack,
  CircularProgress,
  IconButton,
  Paper,
} from '@mui/material';
import {
  Alarm,
  Add,
  CheckCircle,
  Delete,
  OpenInNew,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import {
  deleteReminderApi,
  getRemindersApi,
  updateReminderApi,
} from '../../../../Api/Service';
import { toast } from 'react-toastify';
import ReminderModal from './ReminderModal';
import { formatReminderDateTime } from '../../../../utils/reminderTimezone';

const statusColor = {
  pending: 'warning',
  completed: 'success',
  dismissed: 'default',
};

const LeadRemindersSection = ({
  leadId,
  leadName,
  compact = false,
  showViewAll = false,
  refreshTrigger = 0,
}) => {
  const navigate = useNavigate();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState(null);

  const fetchReminders = useCallback(async () => {
    if (!leadId) return;
    try {
      setLoading(true);
      const response = await getRemindersApi({ leadId });
      if (response.success) {
        setReminders(response.reminders || []);
      }
    } catch (error) {
      console.error('Failed to fetch lead reminders:', error);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders, refreshTrigger]);

  const handleComplete = async (reminder) => {
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

  const handleDelete = async (reminder) => {
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

  const visibleReminders = compact ? reminders.slice(0, 3) : reminders;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5} flexWrap="wrap" gap={1}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Alarm sx={{ fontSize: 18 }} /> Reminders
        </Typography>
       
      </Box>

      {loading ? (
        <Box display="flex" alignItems="center" gap={1} py={1}>
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">Loading reminders...</Typography>
        </Box>
      ) : visibleReminders.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No reminders for this lead yet.</Typography>
      ) : (
        <Stack spacing={1}>
          {visibleReminders.map((reminder) => (
            <Paper key={reminder._id} variant="outlined" sx={{ p: 1.5 }}>
              <Box display="flex" justifyContent="space-between" gap={1} flexWrap="wrap">
                <Box>
                  <Typography variant="body2" fontWeight={700}>{reminder.title}</Typography>
                  {reminder.description && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      {reminder.description}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                    {formatReminderDateTime(reminder.reminderDateTime)}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Chip
                    size="small"
                    label={reminder.status}
                    color={statusColor[reminder.status] || 'default'}
                    sx={{ textTransform: 'capitalize' }}
                  />
                  {reminder.status === 'pending' && (
                    <IconButton size="small" color="success" onClick={() => handleComplete(reminder)}>
                      <CheckCircle fontSize="small" />
                    </IconButton>
                  )}
                  <IconButton
                    size="small"
                    onClick={() => navigate(`/admin/crm/lead/${leadId}/stream`)}
                  >
                    <OpenInNew fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(reminder)}>
                    <Delete fontSize="small" />
                  </IconButton>
                </Stack>
              </Box>
            </Paper>
          ))}
        </Stack>
      )}

      <ReminderModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        leadId={leadId}
        leadName={leadName}
        reminder={editingReminder}
        onSaved={fetchReminders}
      />
    </Box>
  );
};

export default LeadRemindersSection;
