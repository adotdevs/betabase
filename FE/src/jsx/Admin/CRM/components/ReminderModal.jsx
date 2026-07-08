import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  CircularProgress,
  IconButton,
  Box,
  Typography,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import { createReminderApi, updateReminderApi } from '../../../../Api/Service';
import { toast } from 'react-toastify';
import {
  REMINDER_TIMEZONE_LABEL,
  toReminderDateInput,
  toReminderTimeInput,
} from '../../../../utils/reminderTimezone';

const ReminderModal = ({
  open,
  onClose,
  leadId,
  leadName = '',
  reminder = null,
  onSaved,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notifyBeforeMinutes, setNotifyBeforeMinutes] = useState(10);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (reminder) {
      setTitle(reminder.title || '');
      setDescription(reminder.description || '');
      setDate(toReminderDateInput(reminder.reminderDateTime));
      setTime(toReminderTimeInput(reminder.reminderDateTime));
      setNotifyBeforeMinutes(reminder.notifyBeforeMinutes ?? 10);
    } else {
      setTitle('');
      setDescription('');
      setDate('');
      setTime('');
      setNotifyBeforeMinutes(10);
    }
  }, [open, reminder]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!date || !time) {
      toast.error('Date and time are required');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        title: title.trim(),
        description: description.trim(),
        date,
        time,
        notifyBeforeMinutes,
      };

      let response;
      if (reminder?._id) {
        response = await updateReminderApi(reminder._id, payload);
      } else {
        response = await createReminderApi({ ...payload, leadId });
      }

      if (response.success) {
        toast.success(response.msg || 'Reminder saved');
        onSaved?.(response.reminder);
        onClose();
      } else {
        toast.error(response.msg || 'Failed to save reminder');
      }
    } catch (error) {
      console.error('Reminder save error:', error);
      toast.error(error.response?.data?.msg || 'Failed to save reminder');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">{reminder ? 'Edit Reminder' : 'Set Reminder'}</Typography>
          <IconButton onClick={onClose} disabled={saving}>
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {leadName && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Lead: <strong>{leadName}</strong>
          </Typography>
        )}
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              multiline
              minRows={3}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label={`Date (${REMINDER_TIMEZONE_LABEL})`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              required
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label={`Time (${REMINDER_TIMEZONE_LABEL})`}
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              InputLabelProps={{ shrink: true }}
              required
            />
          </Grid>
          <Grid item xs={12}>
            <Typography variant="caption" color="text.secondary">
              Reminder date and time are saved in {REMINDER_TIMEZONE_LABEL}.
            </Typography>
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Notify before (minutes)"
              type="number"
              value={notifyBeforeMinutes}
              onChange={(e) => setNotifyBeforeMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
              inputProps={{ min: 0 }}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}>
          {saving ? <CircularProgress size={22} /> : reminder ? 'Update Reminder' : 'Save Reminder'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReminderModal;
