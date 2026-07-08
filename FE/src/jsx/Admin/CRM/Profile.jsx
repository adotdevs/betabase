import React, { useEffect, useState } from "react";
import {
  Box,
  Grid,
  Card,
  CardHeader,
  CardContent,
  Avatar,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Divider,
} from "@mui/material";
import { useAuthUser, useSignOut } from "react-auth-kit";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

import Sidebar from "./Sidebar";
import CrmAppBarActions from './components/CrmAppBarActions';
import {
  signleUsersApi,
  updateSignleUsersApi,
  GetMyVapiConfigApi,
  UpdateAdminVapiConfigApi,
  GetMySipConfigApi,
  UpdateAdminSipConfigApi,
} from "../../../Api/Service";

const CrmProfile = () => {
  const authUser = useAuthUser();
  const signOut = useSignOut();
  const navigate = useNavigate();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenu, setIsMobileMenu] = useState(false);

  const [isDisable, setIsDisable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [userData, setUserData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    phone: "",
    note: "",
    address: "",
    city: "",
    country: "",
    postalCode: "",
    AiTradingPercentage: 1.25,
  });

  const [vapiConfig, setVapiConfig] = useState({
    apiKey: "",
    assistantId: "",
    phoneNumberId: "",
    enabled: false,
  });
  const [vapiConfigLoading, setVapiConfigLoading] = useState(false);
  const [vapiConfigOpen, setVapiConfigOpen] = useState(false);

  const [sipConfig, setSipConfig] = useState({
    server: "",
    username: "",
    password: "",
    port: 5060,
    enabled: false,
  });
  const [sipConfigLoading, setSipConfigLoading] = useState(false);
  const [sipConfigOpen, setSipConfigOpen] = useState(false);

  const handleInput = (e) => {
    const { name, value } = e.target;
    setUserData((prev) => ({ ...prev, [name]: value }));
  };

  const getCurrentUserProfile = async () => {
    try {
      const currentUser = authUser()?.user;

      if (!currentUser?._id) {
        signOut();
        navigate("/auth/login/crm");
        return;
      }

      // Only admins/subadmins/superadmin allowed in CRM
      if (
        currentUser.role !== "admin" &&
        currentUser.role !== "subadmin" &&
        currentUser.role !== "superadmin"
      ) {
        navigate("/dashboard");
        return;
      }

      const resp = await signleUsersApi(currentUser._id);
      if (!resp.success) {
        toast.error(resp.msg || "Failed to load profile");
        return;
      }

      const profile = resp.signleUser;

      // For admin/subadmin, check profile edit permission
      if (
        (currentUser.role === "admin" || currentUser.role === "subadmin") &&
        profile.adminPermissions?.isProfileUpdate === false
      ) {
        toast.error("Profile editing is disabled by superadmin");
        navigate("/admin/dashboard/crm");
        return;
      }

      setUserData((prev) => ({
        ...prev,
        ...profile,
        password: "",
      }));
    } catch (error) {
      toast.error(error?.message || "Failed to load profile");
    } finally {
      setIsLoading(false);
    }
  };

  const loadVapiConfig = async () => {
    try {
      const response = await GetMyVapiConfigApi();
      if (response.success) {
        setVapiConfig({
          apiKey: response.vapiConfig?.apiKey || "",
          assistantId: response.vapiConfig?.assistantId || "",
          phoneNumberId: response.vapiConfig?.phoneNumberId || "",
          enabled: !!response.vapiConfig?.apiKey,
        });
      }
    } catch (error) {
      console.error("Error loading Vapi config:", error);
    }
  };

  const loadSipConfig = async () => {
    try {
      const response = await GetMySipConfigApi();
      if (response.success) {
        setSipConfig({
          server: response.sipConfig?.server || "",
          username: response.sipConfig?.username || "",
          password: response.sipConfig?.password || "",
          port: response.sipConfig?.port || 5060,
          enabled: response.sipConfig?.enabled || false,
        });
      }
    } catch (error) {
      console.error("Error loading SIP config:", error);
    }
  };

  const updateProfile = async (e) => {
    e.preventDefault();

    const currentUser = authUser()?.user;
    if (!currentUser?._id) {
      signOut();
      navigate("/auth/login/crm");
      return;
    }

    // Re-check permission for admin/subadmin before saving
    if (currentUser.role === "admin" || currentUser.role === "subadmin") {
      try {
        const resp = await signleUsersApi(currentUser._id);
        if (
          resp.success &&
          resp.signleUser.adminPermissions?.isProfileUpdate === false
        ) {
          toast.error("Profile editing is disabled by superadmin");
          return;
        }
      } catch (_) {}
    }

    try {
      setIsDisable(true);
      const body = {
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        password: userData.password || "",
        phone: userData.phone,
        note: userData.note,
        address: userData.address,
        city: userData.city,
        country: userData.country,
        postalCode: userData.postalCode,
        currency: userData.currency || "USD",
        AiTradingPercentage: userData.AiTradingPercentage || 1.25,
      };

      const resp = await updateSignleUsersApi(userData._id, body);
      if (resp.success) {
        toast.success(resp.msg || "Profile updated successfully");
      } else {
        toast.error(resp.msg || "Failed to update profile");
      }
    } catch (error) {
      toast.error(error?.message || "Failed to update profile");
    } finally {
      setIsDisable(false);
    }
  };

  const handleVapiConfigSave = async () => {
    const currentUser = authUser()?.user;
    if (!currentUser?._id) {
      signOut();
      navigate("/auth/login/crm");
      return;
    }

    // Check permission for admin/subadmin
    if (currentUser.role === "admin" || currentUser.role === "subadmin") {
      try {
        const resp = await signleUsersApi(currentUser._id);
        if (
          resp.success &&
          resp.signleUser.adminPermissions?.isProfileUpdate === false
        ) {
          toast.error("Profile editing is disabled by superadmin");
          return;
        }
      } catch (_) {}
    }

    // Require API key for everyone (admin/subadmin/superadmin)
    if (!vapiConfig.apiKey) {
      toast.error(
        "Vapi API key is required. Please configure your Vapi API key to make calls."
      );
      return;
    }

    try {
      setVapiConfigLoading(true);
      const resp = await UpdateAdminVapiConfigApi(currentUser._id, {
        apiKey: vapiConfig.apiKey || null,
        assistantId: vapiConfig.assistantId || null,
        phoneNumberId: vapiConfig.phoneNumberId || null,
        enabled: true,
      });

      if (resp.success) {
        toast.success("Vapi configuration updated successfully");
        setVapiConfigOpen(false);
        await loadVapiConfig();
      } else {
        toast.error(resp.msg || "Failed to update Vapi configuration");
      }
    } catch (error) {
      console.error("Error saving Vapi config:", error);
      toast.error(
        error?.response?.data?.msg || "Failed to update Vapi configuration"
      );
    } finally {
      setVapiConfigLoading(false);
    }
  };

  const handleSipConfigSave = async () => {
    const currentUser = authUser()?.user;
    if (!currentUser?._id) {
      signOut();
      navigate("/auth/login/crm");
      return;
    }

    // Check permission for admin/subadmin
    if (currentUser.role === "admin" || currentUser.role === "subadmin") {
      try {
        const resp = await signleUsersApi(currentUser._id);
        if (
          resp.success &&
          resp.signleUser.adminPermissions?.isProfileUpdate === false
        ) {
          toast.error("Profile editing is disabled by superadmin");
          return;
        }
      } catch (_) {}
    }

    // Validate required fields when enabled
    if (sipConfig.enabled && (!sipConfig.server || !sipConfig.username || !sipConfig.password)) {
      toast.error("Server, username, and password are required when enabling custom SIP config");
      return;
    }

    try {
      setSipConfigLoading(true);
      const resp = await UpdateAdminSipConfigApi(currentUser._id, {
        server: sipConfig.server || null,
        username: sipConfig.username || null,
        password: sipConfig.password || null,
        port: sipConfig.port || 5060,
        enabled: sipConfig.enabled,
      });

      if (resp.success) {
        toast.success("SIP configuration updated successfully");
        setSipConfigOpen(false);
        await loadSipConfig();
      } else {
        toast.error(resp.msg || "Failed to update SIP configuration");
      }
    } catch (error) {
      console.error("Error saving SIP config:", error);
      toast.error(
        error?.response?.data?.msg || "Failed to update SIP configuration"
      );
    } finally {
      setSipConfigLoading(false);
    }
  };

  useEffect(() => {
    getCurrentUserProfile();
    loadVapiConfig();
    loadSipConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          bgcolor: "background.default",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  const initials = `${userData.firstName?.[0] || ""}${userData.lastName?.[0] ||
    ""}`.toUpperCase() || "A";

  return (
    <Box
      sx={{
        display: "block",
        minHeight: "100vh",
        bgcolor: "background.default",
        position: "relative",
      }}
    >
      {/* Sidebar */}
      <Box>
        <Sidebar
          setisMobileMenu={setIsMobileMenu}
          isMobileMenu={isMobileMenu}
          isCollapsed={isSidebarCollapsed}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
        />
      </Box>

      {/* Overlay for mobile */}
      {isMobileMenu && (
        <Box
          onClick={() => setIsMobileMenu(false)}
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 1199,
            display: { xs: "block", md: "none" },
            cursor: "pointer",
          }}
        />
      )}

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          ml: {
            xs: 0,
            md: isSidebarCollapsed ? "80px" : "280px",
          },
          transition: "margin-left 0.3s ease",
        }}
      >
        <Box
          sx={{
            px: 3,
            py: 2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Box>
            <Typography variant="h5" fontWeight={700}>
              My Profile &amp; Vapi Settings
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage your personal information and Vapi call configuration.
            </Typography>
          </Box>
          <CrmAppBarActions />
        </Box>

        <Box sx={{ p: 3 }}>
          <Grid container spacing={3}>
            {/* Left: Profile */}
            <Grid item xs={12} md={6}>
              <Card
                sx={{
                  borderRadius: 3,
                  bgcolor: "background.paper",
                  boxShadow: 3,
                }}
              >
                <CardHeader
                  avatar={
                    <Avatar sx={{ bgcolor: "primary.main", width: 48, height: 48 }}>
                      {initials}
                    </Avatar>
                  }
                  title={
                    <Typography variant="h6" fontWeight={600}>
                      Profile Information
                    </Typography>
                  }
                  subheader={
                    <Typography variant="body2" color="text.secondary">
                      Update your basic profile details.
                    </Typography>
                  }
                />
                <CardContent>
                  <Box
                    component="form"
                    onSubmit={updateProfile}
                    noValidate
                    sx={{ display: "flex", flexDirection: "column", gap: 2 }}
                  >
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="First Name"
                          name="firstName"
                          value={userData.firstName}
                          onChange={handleInput}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Last Name"
                          name="lastName"
                          value={userData.lastName}
                          onChange={handleInput}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          label="Email"
                          name="email"
                          value={userData.email}
                          onChange={handleInput}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          label="Password (leave empty to keep current)"
                          name="password"
                          type="password"
                          value={userData.password}
                          onChange={handleInput}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          label="Phone"
                          name="phone"
                          value={userData.phone}
                          onChange={handleInput}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          label="Address"
                          name="address"
                          value={userData.address}
                          onChange={handleInput}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="City"
                          name="city"
                          value={userData.city}
                          onChange={handleInput}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Country"
                          name="country"
                          value={userData.country}
                          onChange={handleInput}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Postal Code"
                          name="postalCode"
                          value={userData.postalCode}
                          onChange={handleInput}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Note"
                          name="note"
                          value={userData.note}
                          onChange={handleInput}
                          fullWidth
                          multiline
                          minRows={2}
                          size="small"
                        />
                      </Grid>
                    </Grid>

                    <Divider sx={{ my: 2 }} />

                    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                      <Button
                        type="submit"
                        variant="contained"
                        disabled={isDisable}
                        startIcon={
                          isDisable ? (
                            <CircularProgress color="inherit" size={16} />
                          ) : null
                        }
                      >
                        {isDisable ? "Saving..." : "Save Profile"}
                      </Button>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Right: Vapi config */}
            <Grid item xs={12} md={6}>
              <Card
                sx={{
                  borderRadius: 3,
                  bgcolor: "background.paper",
                  boxShadow: 3,
                }}
              >
                <CardHeader
                  title={
                    <Typography variant="h6" fontWeight={600}>
                      Vapi AI Configuration
                    </Typography>
                  }
                  subheader={
                    <Typography variant="body2" color="text.secondary">
                      Configure the Vapi API key and related settings used for CRM
                      calls.
                    </Typography>
                  }
                />
                <CardContent>
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      bgcolor: "background.default",
                      border: "1px solid",
                      borderColor: "divider",
                      mb: 2,
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ color: "text.primary", fontWeight: 500 }}
                    >
                      {vapiConfig.apiKey
                        ? "Vapi configuration detected"
                        : "Vapi not configured"}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: "text.secondary", display: "block", mt: 0.5 }}
                    >
                      {!vapiConfig.apiKey
                        ? "Vapi API key is required. Please configure your Vapi settings to make calls."
                        : "Your calls will use your configured Vapi API key and settings."}
                    </Typography>
                  </Box>

                  <Button
                    type="button"
                    variant="outlined"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setVapiConfigOpen(true);
                    }}
                    disabled={authUser()?.user?.role === "admin" || authUser()?.user?.role === "subadmin" 
                      ? userData?.adminPermissions?.isProfileUpdate === false 
                      : false}
                  >
                    {vapiConfig.apiKey ? "Edit Vapi Config" : "Configure Vapi"}
                  </Button>
                </CardContent>
              </Card>
            </Grid>

            {/* SIP Configuration - Only show if profile update is allowed */}
            {(() => {
              const currentUser = authUser()?.user;
              const canEditProfile = currentUser?.role === "superadmin" || 
                (currentUser?.role === "admin" && userData?.adminPermissions?.isProfileUpdate !== false) ||
                (currentUser?.role === "subadmin" && userData?.adminPermissions?.isProfileUpdate !== false);
              
              if (!canEditProfile) return null;
              
              return (
                <Grid item xs={12} md={6}>
                  <Card
                    sx={{
                      borderRadius: 3,
                      bgcolor: "background.paper",
                      boxShadow: 3,
                    }}
                  >
                    <CardHeader
                      title={
                        <Typography variant="h6" fontWeight={600}>
                          SIP Configuration
                        </Typography>
                      }
                      subheader={
                        <Typography variant="body2" color="text.secondary">
                          Configure custom SIP credentials. If disabled, default environment SIP credentials will be used.
                        </Typography>
                      }
                    />
                    <CardContent>
                      <Box
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          bgcolor: "background.default",
                          border: "1px solid",
                          borderColor: "divider",
                          mb: 2,
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ color: "text.primary", fontWeight: 500 }}
                        >
                          {sipConfig.enabled
                            ? "Custom SIP configuration enabled"
                            : "Using default SIP configuration"}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: "text.secondary", display: "block", mt: 0.5 }}
                        >
                          {!sipConfig.enabled
                            ? "Configure custom SIP credentials to use your own SIP server and credentials for calls."
                            : "Your calls will use your configured SIP server and credentials."}
                        </Typography>
                      </Box>

                      <Button
                        type="button"
                        variant="outlined"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSipConfigOpen(true);
                        }}
                      >
                        {sipConfig.enabled ? "Edit SIP Config" : "Configure SIP"}
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })()}
          </Grid>
        </Box>
      </Box>

      {/* Simple Vapi Config Modal (inline, basic styling to stay fast) */}
      {vapiConfigOpen && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            bgcolor: "rgba(0,0,0,0.7)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => !vapiConfigLoading && setVapiConfigOpen(false)}
        >
          <Box
            sx={{
              bgcolor: "background.paper",
              borderRadius: 2,
              p: 3,
              width: "100%",
              maxWidth: 480,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 2,
              }}
            >
              <Typography variant="h6">Vapi Configuration</Typography>
              <Button
                type="button"
                size="small"
                onClick={() => !vapiConfigLoading && setVapiConfigOpen(false)}
              >
                Close
              </Button>
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField
                label="API Key *"
                type="password"
                value={vapiConfig.apiKey}
                onChange={(e) =>
                  setVapiConfig((prev) => ({ ...prev, apiKey: e.target.value }))
                }
                fullWidth
                size="small"
                disabled={vapiConfigLoading}
              />
              <TextField
                label="Assistant ID"
                value={vapiConfig.assistantId}
                onChange={(e) =>
                  setVapiConfig((prev) => ({
                    ...prev,
                    assistantId: e.target.value,
                  }))
                }
                fullWidth
                size="small"
                disabled={vapiConfigLoading}
              />
              <TextField
                label="Phone Number ID"
                value={vapiConfig.phoneNumberId}
                onChange={(e) =>
                  setVapiConfig((prev) => ({
                    ...prev,
                    phoneNumberId: e.target.value,
                  }))
                }
                fullWidth
                size="small"
                disabled={vapiConfigLoading}
              />
            </Box>

            <Box
              sx={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 1.5,
                mt: 3,
              }}
            >
              <Button
                type="button"
                onClick={() => !vapiConfigLoading && setVapiConfigOpen(false)}
                disabled={vapiConfigLoading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="contained"
                onClick={handleVapiConfigSave}
                disabled={vapiConfigLoading || !vapiConfig.apiKey}
                startIcon={
                  vapiConfigLoading ? (
                    <CircularProgress color="inherit" size={16} />
                  ) : null
                }
              >
                {vapiConfigLoading ? "Saving..." : "Save Configuration"}
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {/* SIP Config Modal */}
      {sipConfigOpen && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            bgcolor: "rgba(0,0,0,0.7)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => !sipConfigLoading && setSipConfigOpen(false)}
        >
          <Box
            sx={{
              bgcolor: "background.paper",
              borderRadius: 2,
              p: 3,
              width: "100%",
              maxWidth: 480,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 2,
              }}
            >
              <Typography variant="h6">SIP Configuration</Typography>
              <Button
                type="button"
                size="small"
                onClick={() => !sipConfigLoading && setSipConfigOpen(false)}
              >
                Close
              </Button>
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <input
                  type="checkbox"
                  checked={sipConfig.enabled}
                  onChange={(e) => setSipConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                  disabled={sipConfigLoading}
                />
                <Typography variant="body2">
                  Enable Custom SIP Configuration
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                When enabled, use your own SIP credentials. If disabled, default environment SIP credentials will be used.
              </Typography>

              {sipConfig.enabled && (
                <>
                  <TextField
                    label="SIP Server *"
                    value={sipConfig.server}
                    onChange={(e) =>
                      setSipConfig((prev) => ({ ...prev, server: e.target.value }))
                    }
                    fullWidth
                    size="small"
                    disabled={sipConfigLoading}
                    helperText="e.g., reg.g-call.tel or 65.109.172.127"
                  />
                  <TextField
                    label="SIP Username *"
                    value={sipConfig.username}
                    onChange={(e) =>
                      setSipConfig((prev) => ({ ...prev, username: e.target.value }))
                    }
                    fullWidth
                    size="small"
                    disabled={sipConfigLoading}
                  />
                  <TextField
                    label="SIP Password *"
                    type="password"
                    value={sipConfig.password}
                    onChange={(e) =>
                      setSipConfig((prev) => ({ ...prev, password: e.target.value }))
                    }
                    fullWidth
                    size="small"
                    disabled={sipConfigLoading}
                  />
                  <TextField
                    label="SIP Port"
                    type="number"
                    value={sipConfig.port}
                    onChange={(e) =>
                      setSipConfig((prev) => ({ ...prev, port: parseInt(e.target.value) || 5060 }))
                    }
                    fullWidth
                    size="small"
                    disabled={sipConfigLoading}
                    helperText="Default: 5060"
                    inputProps={{ min: 1, max: 65535 }}
                  />
                </>
              )}
            </Box>

            <Box
              sx={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 1.5,
                mt: 3,
              }}
            >
              <Button
                type="button"
                onClick={() => !sipConfigLoading && setSipConfigOpen(false)}
                disabled={sipConfigLoading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="contained"
                onClick={handleSipConfigSave}
                disabled={sipConfigLoading || (sipConfig.enabled && (!sipConfig.server || !sipConfig.username || !sipConfig.password))}
                startIcon={
                  sipConfigLoading ? (
                    <CircularProgress color="inherit" size={16} />
                  ) : null
                }
              >
                {sipConfigLoading ? "Saving..." : "Save Configuration"}
              </Button>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default CrmProfile;


