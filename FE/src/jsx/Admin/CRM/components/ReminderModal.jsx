import React, { useEffect, useMemo, useState } from 'react';
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import { createReminderApi, updateReminderApi } from '../../../../Api/Service';
import { toast } from 'react-toastify';
import {
  REMINDER_TIMEZONE_LABEL,
  toReminderDateInput,
  toReminderTimeInput,
} from '../../../../utils/reminderTimezone';

const REMINDER_MINUTE_OPTIONS = [0, 15, 30, 45];
const NOTIFY_BEFORE_OPTIONS = [0, 15, 30, 45, 60];

const pad2 = (value) => String(value).padStart(2, '0');

const snapToQuarterHour = (minutes) => {
  const numeric = Number(minutes);
  if (Number.isNaN(numeric)) return 0;
  return REMINDER_MINUTE_OPTIONS.reduce((closest, option) =>
    Math.abs(option - numeric) < Math.abs(closest - numeric) ? option : closest
  );
};

const snapNotifyBeforeMinutes = (minutes) => {
  const numeric = Number(minutes);
  if (Number.isNaN(numeric)) return 15;
  return NOTIFY_BEFORE_OPTIONS.reduce((closest, option) =>
    Math.abs(option - numeric) < Math.abs(closest - numeric) ? option : closest
  );
};

const parseTimeParts = (timeValue) => {
  if (!timeValue) return { hour: '', minute: '' };
  const [hourPart, minutePart] = timeValue.split(':');
  return {
    hour: pad2(Number(hourPart) || 0),
    minute: pad2(snapToQuarterHour(minutePart)),
  };
};

const buildTimeValue = (hour, minute) => {
  if (hour === '' || minute === '') return '';
  return `${pad2(hour)}:${pad2(minute)}`;
};

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => pad2(index));

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
  const [timeHour, setTimeHour] = useState('');
  const [timeMinute, setTimeMinute] = useState('');
  const [notifyBeforeMinutes, setNotifyBeforeMinutes] = useState(15);
  const [saving, setSaving] = useState(false);

  const time = useMemo(
    () => buildTimeValue(timeHour, timeMinute),
    [timeHour, timeMinute]
  );

  useEffect(() => {
    if (!open) return;

    if (reminder) {
      setTitle(reminder.title || '');
      setDescription(reminder.description || '');
      setDate(toReminderDateInput(reminder.reminderDateTime));
      const parts = parseTimeParts(toReminderTimeInput(reminder.reminderDateTime));
      setTimeHour(parts.hour);
      setTimeMinute(parts.minute);
      setNotifyBeforeMinutes(snapNotifyBeforeMinutes(reminder.notifyBeforeMinutes ?? 15));
    } else {
      setTitle('');
      setDescription('');
      setDate('');
      setTimeHour('');
      setTimeMinute('');
      setNotifyBeforeMinutes(15);
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
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth required>
              <InputLabel id="reminder-hour-label">Hour</InputLabel>
              <Select
                labelId="reminder-hour-label"
                label={`Hour (${REMINDER_TIMEZONE_LABEL})`}
                value={timeHour}
                onChange={(e) => setTimeHour(e.target.value)}
              >
                {HOUR_OPTIONS.map((hour) => (
                  <MenuItem key={hour} value={hour}>
                    {hour}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth required>
              <InputLabel id="reminder-minute-label">Minutes</InputLabel>
              <Select
                labelId="reminder-minute-label"
                label="Minutes"
                value={timeMinute}
                onChange={(e) => setTimeMinute(e.target.value)}
              >
                {REMINDER_MINUTE_OPTIONS.map((minute) => (
                  <MenuItem key={minute} value={pad2(minute)}>
                    {pad2(minute)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <Typography variant="caption" color="text.secondary">
              Reminder date and time are saved in {REMINDER_TIMEZONE_LABEL}. Minutes are available in 15-minute intervals.
            </Typography>
          </Grid>
          <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel id="notify-before-label">Notify before</InputLabel>
              <Select
                labelId="notify-before-label"
                label="Notify before"
                value={notifyBeforeMinutes}
                onChange={(e) => setNotifyBeforeMinutes(Number(e.target.value))}
              >
                {NOTIFY_BEFORE_OPTIONS.map((minutes) => (
                  <MenuItem key={minutes} value={minutes}>
                    {minutes === 0 ? 'At reminder time' : `${minutes} minutes before`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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
