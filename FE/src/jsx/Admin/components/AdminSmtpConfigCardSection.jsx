import React, { useState } from "react";
import { Box, Button, Divider, Typography } from "@mui/material";
import EmailIcon from "@mui/icons-material/Email";
import { useAuthUser } from "react-auth-kit";
import AdminSmtpConfigDialog from "./AdminSmtpConfigDialog";

const isSmtpConfigured = (user) =>
  !!(user?.smtpConfig?.enabled && user?.smtpConfig?.host && user?.smtpConfig?.user);

const AdminSmtpConfigCardSection = ({ user, onUpdated, accentColor = "primary.main" }) => {
  const authUser = useAuthUser();
  const [open, setOpen] = useState(false);

  if (authUser()?.user?.role !== "superadmin") {
    return null;
  }

  const configured = isSmtpConfigured(user);

  return (
    <>
      <Divider sx={{ borderColor: "rgba(255, 255, 255, 0.1)", my: 2 }} />

      <Box>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, gap: 1, flexWrap: "wrap" }}>
          <Box sx={{ display: "flex", alignItems: "center", minWidth: 0 }}>
            <EmailIcon sx={{ color: accentColor, mr: 1, fontSize: 20 }} />
            <Typography variant="subtitle2" fontWeight={600} sx={{ color: "text.secondary" }}>
              Email SMTP
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={<EmailIcon />}
            onClick={() => setOpen(true)}
            sx={{ textTransform: "none" }}
          >
            {configured ? "Edit SMTP" : "Configure SMTP"}
          </Button>
        </Box>

        <Box
          sx={{
            p: 2,
            borderRadius: 1,
            bgcolor: "background.default",
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          {configured ? (
            <>
              <Typography variant="body2" sx={{ color: "text.primary", mb: 0.5 }}>
                <strong>Status:</strong> Personal SMTP enabled
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                Host: {user.smtpConfig.host}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                Sender: {user.smtpConfig.fromEmail || user.smtpConfig.user}
              </Typography>
            </>
          ) : (
            <>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                No personal SMTP configured
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
                User will send CRM emails with the default system email only
              </Typography>
            </>
          )}
        </Box>
      </Box>

      <AdminSmtpConfigDialog
        open={open}
        onClose={() => setOpen(false)}
        user={user}
        onSaved={(smtpConfig) => onUpdated?.(user._id, smtpConfig)}
      />
    </>
  );
};

export default AdminSmtpConfigCardSection;
