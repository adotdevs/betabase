import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { toast } from "react-toastify";
import { UpdateAdminSmtpConfigApi } from "../../../Api/Service";

const HOSTINGER_DEFAULTS = {
  host: "smtp.hostinger.com",
  port: 465,
  secure: true,
};

const AdminSmtpConfigDialog = ({ open, onClose, user, onSaved }) => {
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    ...HOSTINGER_DEFAULTS,
    user: "",
    password: "",
    fromEmail: "",
    fromName: "",
    enabled: false,
  });

  useEffect(() => {
    if (!open || !user) return;

    const saved = user.smtpConfig || {};

    setForm({
      host: saved.host || HOSTINGER_DEFAULTS.host,
      port: saved.port || HOSTINGER_DEFAULTS.port,
      user: "",
      password: "",
      fromEmail: "",
      fromName: "",
      secure: saved.host ? saved.secure !== false : HOSTINGER_DEFAULTS.secure,
      enabled: !!saved.enabled,
    });
    setShowPassword(false);
  }, [open, user]);

  const handleChange = (field) => (event) => {
    const value =
      field === "enabled" || field === "secure"
        ? event.target.checked
        : field === "port"
          ? parseInt(event.target.value, 10) || HOSTINGER_DEFAULTS.port
          : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    const hasExistingUser = !!String(user?.smtpConfig?.user || "").trim();

    if (form.enabled) {
      if (!form.host.trim()) {
        toast.error("SMTP host is required when enabled");
        return;
      }

      if (!form.user.trim() && !hasExistingUser) {
        toast.error("Email / SMTP username is required when enabled");
        return;
      }

      const hasExistingPassword = !!(user?.smtpConfig?.enabled && user?.smtpConfig?.host && hasExistingUser);
      if (!form.password.trim() && !hasExistingPassword) {
        toast.error("Password is required when enabling SMTP");
        return;
      }
    }

    setSaving(true);
    try {

      const payload = {
        host: form.host.trim() || HOSTINGER_DEFAULTS.host,
        port: form.port || HOSTINGER_DEFAULTS.port,
        secure: form.secure,
        enabled: form.enabled,
      };

      if (form.user.trim()) {
        payload.user = form.user.trim();
      } else if (!hasExistingUser) {
        payload.user = null;
      }

      if (form.fromEmail.trim()) {
        payload.fromEmail = form.fromEmail.trim();
      } else {
        payload.fromEmail = null;
      }

      if (form.fromName.trim()) {
        payload.fromName = form.fromName.trim();
      } else {
        payload.fromName = null;
      }

      if (form.password.trim()) {
        payload.password = form.password.trim();
      }

      const res = await UpdateAdminSmtpConfigApi(user._id, payload);
      if (res.success) {
        toast.success(res.msg || "SMTP configuration saved");
        onSaved?.(res.smtpConfig);
        onClose();
      } else {
        toast.error(res.msg || "Failed to save SMTP configuration");
      }
    } catch (error) {
      toast.error(error?.msg || "Failed to save SMTP configuration");
    } finally {
      setSaving(false);
    }
  };

  const userLabel = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email
    : "User";

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Email SMTP — {userLabel}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Hostinger SMTP is pre-filled by default. Enter the email account username and password below.
        </Typography>

        <FormControlLabel
          control={
            <Switch checked={form.enabled} onChange={handleChange("enabled")} />
          }
          label="Enable personal SMTP"
          sx={{ mb: 2, display: "block" }}
        />

        {form.enabled && (
          <Box sx={{ display: "grid", gap: 2 }}>
            <TextField
              label="SMTP Host"
              value={form.host}
              onChange={handleChange("host")}
              fullWidth
              size="small"
              required
            />
            <TextField
              label="SMTP Port"
              type="number"
              value={form.port}
              onChange={handleChange("port")}
              fullWidth
              size="small"
            />
            <TextField
              label="Email / SMTP Username"
              value={form.user}
              onChange={handleChange("user")}
              placeholder="your-email@yourdomain.com"
              fullWidth
              size="small"
              required
            />
            <TextField
              label="Password"
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={handleChange("password")}
              placeholder={user?.smtpConfig?.enabled ? "Leave blank to keep current password" : "Enter email password"}
              fullWidth
              size="small"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((prev) => !prev)}
                      onMouseDown={(event) => event.preventDefault()}
                      edge="end"
                      size="small"
                    >
                      {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              label="From Email (optional)"
              value={form.fromEmail}
              onChange={handleChange("fromEmail")}
              fullWidth
              size="small"
            />
            <TextField
              label="From Name (optional)"
              value={form.fromName}
              onChange={handleChange("fromName")}
              fullWidth
              size="small"
            />
            <FormControlLabel
              control={
                <Switch checked={form.secure} onChange={handleChange("secure")} />
              }
              label="Use SSL (port 465)"
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <CircularProgress size={20} /> : "Save SMTP"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AdminSmtpConfigDialog;
