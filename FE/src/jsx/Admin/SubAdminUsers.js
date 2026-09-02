import React, { useEffect, useMemo, useState } from "react";
import AdminShell from "./theme/AdminShell";
import AdminSkeleton from "./theme/AdminSkeleton";
import SideBar from "../layouts/AdminSidebar/Sidebar";
import Log from "../../assets/images/img/log.jpg";
import {
  allUsersApi,
  bypassSingleUserApi,
  UnassignUserApi,
  signleUsersApi,
  UpdateSubAdminPermissionsApi,
} from "../../Api/Service";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuthUser } from "react-auth-kit";
import {
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  CardActions,
  CardHeader,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  CalendarToday as CalendarIcon,
  CheckCircle as CheckIcon,
  ContactMail as ContactIcon,
  Email as EmailIcon,
  ManageAccounts as ManageIcon,
  Person as PersonIcon,
  PersonRemove as UnassignIcon,
  VerifiedUser as VerifiedIcon,
  Warning as WarningIcon,
  HourglassTop as HourglassTopIcon,
} from "@mui/icons-material";
import AdminHeader from "./adminHeader";
import { hasSubAdminAccessToUser } from "./assets/subAdminAssignment";
import userCardStyles from "./assets/AdminUserCards.module.css";
import "./assets/AdminUserCard.css";

const cardSx = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  borderRadius: 4,
  overflow: "visible",
  border: "1px solid",
  borderColor: "grey.800",
  background: "linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%)",
  position: "relative",
  "&:hover": {
    boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
    transform: "translateY(-4px)",
  },
};

const getUserKycStatus = (user) => {
  const hasCnic = Boolean(user?.submitDoc?.cnic);
  const hasBill = Boolean(user?.submitDoc?.bill);
  const docsSubmitted = user?.submitDoc?.status === "completed" || hasCnic || hasBill;
  const iconSx = { fontSize: "14px" };

  if (user?.kyc === true) {
    return {
      key: "verified",
      label: "KYC Verified",
      icon: <VerifiedIcon sx={iconSx} />,
      accent: "#17c964",
    };
  }

  if (docsSubmitted) {
    const isPartial = (!hasCnic || !hasBill) && user?.submitDoc?.status !== "completed";
    if (isPartial) {
      return {
        key: "partial",
        label: "KYC Partial",
        icon: <HourglassTopIcon sx={iconSx} />,
        accent: "#006FEE",
      };
    }

    return {
      key: "submitted",
      label: "KYC Submitted",
      icon: <HourglassTopIcon sx={iconSx} />,
      accent: "#f5a524",
    };
  }

  return {
    key: "unverified",
    label: "KYC Unverified",
    icon: <WarningIcon sx={iconSx} />,
    accent: "#f31260",
  };
};

const SubAdminUserCard = ({
  user,
  isUnverified = false,
  canUnassign = false,
  onUnassign,
  onVerify,
  isVerifying = false,
}) => {
  const kycStatus = getUserKycStatus(user);

  return (
    <Card
      className={userCardStyles.card}
      sx={{
        ...cardSx,
        borderTop: `3px solid ${kycStatus.accent}`,
      }}
    >
      <Box sx={{ position: "absolute", top: 16, right: 16, zIndex: 2 }}>
        <Badge
          badgeContent={
            user.verified ? (
              <VerifiedIcon sx={{ fontSize: 16, color: "success.main" }} />
            ) : (
              <WarningIcon sx={{ fontSize: 16, color: "warning.main" }} />
            )
          }
        >
          <Avatar
            src={Log}
            sx={{
              width: 70,
              height: 70,
              border: "4px solid",
              borderColor: "grey.900",
              boxShadow: 3,
              bgcolor: user.verified ? "success.dark" : "warning.dark",
            }}
          >
            <PersonIcon />
          </Avatar>
        </Badge>
      </Box>

      <CardHeader
        title={
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1, pr: 9 }}>
            <Link
              to={`/admin/users/${user._id}?tab=compliance`}
              className={`hui-chip hui-chip--${kycStatus.key}`}
              title={kycStatus.label}
            >
              <span className="hui-chip-icon">{kycStatus.icon}</span>
              {kycStatus.label}
            </Link>
            <Typography
              variant="h6"
              fontWeight="700"
              sx={{
                background: "linear-gradient(45deg, #64b5f6, #42a5f5)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {user.firstName} {user.lastName}
            </Typography>
          </Box>
        }
        subheader={
          <Box sx={{ mt: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
              <EmailIcon sx={{ fontSize: 16, mr: 1, color: "grey.400" }} />
              <Typography variant="body2" sx={{ color: "grey.400" }} noWrap>
                {user.email}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <CalendarIcon sx={{ fontSize: 14, mr: 1, color: "grey.500" }} />
              <Typography variant="caption" sx={{ color: "grey.500" }}>
                Joined {new Date(user.createdAt).toLocaleDateString()}
              </Typography>
            </Box>
          </Box>
        }
        sx={{
          pt: 3,
          pb: 1,
          "& .MuiCardHeader-content": { overflow: "hidden" },
        }}
      />

      <Divider sx={{ mx: 2, bgcolor: "grey.700" }} />

      <CardActions sx={{ p: 2, gap: 1, mt: "auto" }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, width: "100%" }}>
          <Box sx={{ display: "flex", gap: 1, width: "100%", flexWrap: "wrap" }}>
            <Button
              component={Link}
              to={`/admin/users/${user._id}`}
              variant="contained"
              startIcon={<ManageIcon />}
              size="small"
              sx={{
                flex: 1,
                minWidth: "120px",
                borderRadius: 3,
                textTransform: "none",
                fontWeight: 600,
                py: 1,
                minHeight: "40px",
                background: "linear-gradient(45deg, #1976d2, #42a5f5)",
                boxShadow: "0 4px 15px rgba(25, 118, 210, 0.3)",
                "&:hover": {
                  background: "linear-gradient(45deg, #1565c0, #1e88e5)",
                },
              }}
            >
              Manage User
            </Button>

            <Button
              component={Link}
              to={`/admin/createTicket/${user._id}/${user.email}`}
              variant="outlined"
              startIcon={<ContactIcon />}
              className={userCardStyles.contactBtn}
              size="small"
              sx={{
                flex: 1,
                minWidth: "120px",
                borderRadius: 3,
                textTransform: "none",
                fontWeight: 500,
                py: 1,
                minHeight: "40px",
                borderColor: "secondary.main",
                color: "grey.200",
                "&:hover": {
                  backgroundColor: "secondary.dark",
                  borderColor: "secondary.light",
                },
              }}
            >
              Contact User
            </Button>
          </Box>

          {isUnverified && (
            <Button
              variant="contained"
              color="warning"
              startIcon={<CheckIcon />}
              size="small"
              disabled={isVerifying}
              onClick={() => onVerify?.(user)}
              sx={{
                width: "100%",
                borderRadius: 3,
                textTransform: "none",
                fontWeight: 600,
                py: 1,
                minHeight: "40px",
                backgroundColor: "warning.dark",
                "&:hover": { backgroundColor: "warning.main" },
              }}
            >
              {isVerifying ? "Verifying..." : "Verify Email"}
            </Button>
          )}

          {canUnassign && (
            <Button
              variant="outlined"
              startIcon={<UnassignIcon />}
              className={userCardStyles.outlineBtn}
              size="small"
              onClick={() => onUnassign?.(user)}
              sx={{
                width: "100%",
                borderRadius: 3,
                textTransform: "none",
                fontWeight: 600,
                py: 1,
                minHeight: "40px",
                borderWidth: 2,
                borderColor: "error.dark",
                color: "#ef9a9a",
                "&:hover": {
                  borderWidth: 2,
                  backgroundColor: "error.dark",
                  borderColor: "error.light",
                  color: "#fff",
                },
              }}
            >
              Unassign User
            </Button>
          )}
        </Box>
      </CardActions>
    </Card>
  );
};

const SubAdminUsers = () => {
  const [Users, setUsers] = useState([]);
  const [unVerified, setunVerified] = useState([]);
  const [open, setOpen] = useState(false);
  const [modalData, setmodalData] = useState({});
  const [isDisable, setisDisable] = useState(false);
  const [isUsers, setisUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const authUser = useAuthUser();
  const Navigate = useNavigate();
  const { id: subAdminId } = useParams();
  const [isLoading, setisLoading] = useState(true);
  const [isLoadingSubadmin, setisLoadingSubadmin] = useState(true);
  const [subadminDetails, setsubadminDetails] = useState(null);
  const [Active, setActive] = useState(false);
  const [isAssignUser, setisAssignUser] = useState(false);
  const [walletPermissionLoading, setWalletPermissionLoading] = useState(false);

  const currentRole = authUser()?.user?.role;
  const canUnassign =
    (currentRole === "admin" && isAssignUser) || currentRole === "superadmin";

  const filterUsers = (list) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((user) => {
      const name = `${user.firstName || ""} ${user.lastName || ""}`.toLowerCase();
      const email = String(user.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  };

  const filteredVerified = useMemo(() => filterUsers(Users), [Users, searchQuery]);
  const filteredUnverified = useMemo(() => filterUsers(unVerified), [unVerified, searchQuery]);

  const getAllUsers = async () => {
    try {
      const allUsers = await allUsersApi();
      const currentUser = subAdminId;

      if (allUsers.success) {
        const filtered = allUsers.allUsers.filter(
          (user) =>
            user.role === "user" &&
            user.verified === true &&
            hasSubAdminAccessToUser(user, currentUser)
        );

        const unverified = allUsers.allUsers.filter(
          (user) =>
            user.role === "user" &&
            user.verified === false &&
            hasSubAdminAccessToUser(user, currentUser)
        );

        setUsers(filtered.reverse());
        setunVerified(unverified.reverse());
      } else {
        toast.dismiss();
        toast.error(allUsers.msg);
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error);
    } finally {
      setisLoading(false);
    }
  };

  const deleteEachUser = async (user) => {
    try {
      setisDisable(true);
      const allUsers = await UnassignUserApi(user._id, subAdminId);

      if (allUsers.success) {
        toast.dismiss();
        toast.success(allUsers.msg);
        setOpen(false);
        getAllUsers();
      } else {
        toast.dismiss();
        toast.error(allUsers.msg);
        setOpen(false);
        getAllUsers();
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error);
    } finally {
      setisDisable(false);
    }
  };

  const bypassSingleUser = async (user) => {
    try {
      setisUsers(true);
      const signleUser = await bypassSingleUserApi(user._id);

      if (signleUser.success) {
        toast.dismiss();
        getAllUsers();
        toast.success(signleUser.msg);
      } else {
        toast.dismiss();
        toast.error(signleUser.msg);
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error);
    } finally {
      setisUsers(false);
    }
  };

  const getSignleUser = async () => {
    try {
      const signleUser = await signleUsersApi(subAdminId);

      if (signleUser.success) {
        setisLoadingSubadmin(false);
        setsubadminDetails(signleUser.signleUser);
      } else {
        toast.dismiss();
        toast.error(signleUser.msg);
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error);
    }
  };

  const getActiveSignleUser = async () => {
    try {
      const signleUser = await signleUsersApi(authUser().user._id);

      if (signleUser.success) {
        if (
          signleUser.signleUser.adminPermissions?.isSubManagement === false &&
          signleUser.signleUser.role === "admin"
        ) {
          Navigate("/admin/dashboard");
        }
        setisAssignUser(signleUser.signleUser?.adminPermissions?.isAddUsersToSubAdmin);
      } else {
        toast.dismiss();
        toast.error(signleUser.msg);
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error);
    }
  };

  const handleWalletPermissionChange = async (enabled) => {
    if (!subadminDetails?._id) {
      toast.error("Subadmin details not available");
      return;
    }
    setWalletPermissionLoading(true);
    try {
      const res = await UpdateSubAdminPermissionsApi(subadminDetails._id, {
        accessWallet: enabled,
      });
      if (res.success) {
        toast.success("Wallet permission updated successfully");
        setsubadminDetails((prev) => ({
          ...prev,
          permissions: {
            ...prev.permissions,
            accessWallet: enabled,
          },
        }));
      } else {
        toast.error(res.msg || "Failed to update wallet permission");
      }
    } catch (error) {
      toast.error(error?.msg || "Failed to update wallet permission");
    } finally {
      setWalletPermissionLoading(false);
    }
  };

  useEffect(() => {
    if (authUser().user.role === "user") {
      Navigate("/dashboard");
      return;
    }
    if (authUser().user.role === "subadmin") {
      Navigate("/admin/dashboard");
      return;
    }
    getSignleUser();
    getAllUsers();
    getActiveSignleUser();
  }, []);

  const toggleBar = () => setActive((prev) => !prev);
  const onOpenModal = (user) => {
    setOpen(true);
    setmodalData(user);
  };
  const onCloseModal = () => setOpen(false);

  return (
    <AdminShell>
      <div className="admin dark-new-ui">
        <div className="bg-gray-900 min-h-screen">
          <SideBar state={Active} toggle={toggleBar} />
          <div className="bg-gray-900 relative min-h-screen w-full overflow-x-hidden px-4 transition-all duration-300 xl:px-10 lg:max-w-[calc(100%_-_280px)] lg:ms-[280px]">
            <div className="mx-auto w-full max-w-7xl">
              <AdminHeader toggle={toggleBar} pageName="Sub admin Users Management" />

              <Box sx={{ px: { xs: 2, md: 4 }, py: 3 }}>
                {isLoading ? (
                  <AdminSkeleton variant="cards" rows={3} />
                ) : (
                  <>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: { xs: "flex-start", md: "center" },
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 2,
                        mb: 4,
                        pb: 3,
                        borderBottom: "2px solid rgba(66, 165, 245, 0.3)",
                      }}
                    >
                      <Box>
                        <Typography variant="h5" fontWeight={700} sx={{ color: "grey.100", mb: 0.5 }}>
                          Assigned Users
                        </Typography>
                        <Typography variant="body2" sx={{ color: "grey.400" }}>
                          {Users.length} verified
                          {unVerified.length > 0 ? ` • ${unVerified.length} unverified` : ""}
                        </Typography>
                        {!isLoadingSubadmin && subadminDetails && (
                          <Typography variant="body2" sx={{ color: "grey.400", mt: 1 }}>
                            Managing users for{" "}
                            <Link
                              to={`/admin/user/${subAdminId}/general`}
                              style={{ color: "#64b5f6", textDecoration: "none", fontWeight: 600 }}
                            >
                              {subadminDetails.firstName} {subadminDetails.lastName}
                            </Link>
                            {" — "}
                            {subadminDetails.email}
                          </Typography>
                        )}
                      </Box>
                      <TextField
                        size="small"
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        sx={{
                          minWidth: { xs: "100%", sm: 280 },
                          "& .MuiOutlinedInput-root": {
                            borderRadius: 3,
                            bgcolor: "rgba(255,255,255,0.05)",
                            color: "grey.100",
                            "& fieldset": { borderColor: "rgba(255,255,255,0.15)" },
                            "&:hover fieldset": { borderColor: "rgba(255,255,255,0.3)" },
                            "&.Mui-focused fieldset": { borderColor: "primary.main" },
                          },
                          "& .MuiInputBase-input::placeholder": { color: "grey.500", opacity: 1 },
                        }}
                      />
                    </Box>

                    {!isLoadingSubadmin &&
                      subadminDetails &&
                      (currentRole === "superadmin" || currentRole === "admin") && (
                        <Card
                          sx={{
                            mb: 4,
                            p: 2.5,
                            borderRadius: 3,
                            background: "linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%)",
                            border: "1px solid rgba(255,255,255,0.1)",
                          }}
                        >
                          <FormControlLabel
                            control={
                              <Switch
                                checked={subadminDetails.permissions?.accessWallet === true}
                                disabled={walletPermissionLoading}
                                onChange={(e) => handleWalletPermissionChange(e.target.checked)}
                                color="primary"
                              />
                            }
                            label={
                              <Box>
                                <Typography variant="subtitle1" fontWeight={600} sx={{ color: "grey.100" }}>
                                  Wallet Access Permission
                                </Typography>
                                <Typography variant="body2" sx={{ color: "grey.400" }}>
                                  {subadminDetails.permissions?.accessWallet === true
                                    ? "This subadmin has access to wallet platform and all wallet features."
                                    : "This subadmin does not have access to wallet platform."}
                                </Typography>
                              </Box>
                            }
                            sx={{ width: "100%", m: 0, alignItems: "flex-start" }}
                          />
                        </Card>
                      )}

                    <Grid container spacing={3}>
                      {filteredVerified.length > 0 ? (
                        filteredVerified.map((user) => (
                          <Grid item xs={12} sm={6} md={4} key={user._id}>
                            <SubAdminUserCard
                              user={user}
                              canUnassign={canUnassign}
                              onUnassign={onOpenModal}
                            />
                          </Grid>
                        ))
                      ) : (
                        <Grid item xs={12}>
                          <Typography sx={{ color: "grey.400", textAlign: "center", py: 4 }}>
                            No verified users assigned to this subadmin.
                          </Typography>
                        </Grid>
                      )}
                    </Grid>

                    {filteredUnverified.length > 0 && (
                      <Box sx={{ mt: 6 }}>
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 2,
                            mb: 3,
                            pb: 2,
                            borderBottom: "2px solid rgba(255, 167, 38, 0.3)",
                          }}
                        >
                          <Avatar sx={{ bgcolor: "rgba(255, 152, 0, 0.15)", border: "2px solid rgba(255, 167, 38, 0.3)" }}>
                            <WarningIcon sx={{ color: "warning.main" }} />
                          </Avatar>
                          <Box>
                            <Typography variant="h6" fontWeight={700} sx={{ color: "grey.100" }}>
                              Unverified Users
                            </Typography>
                            <Typography variant="body2" sx={{ color: "grey.400" }}>
                              {filteredUnverified.length} user{filteredUnverified.length !== 1 ? "s" : ""} pending email verification
                            </Typography>
                          </Box>
                        </Box>
                        <Grid container spacing={3}>
                          {filteredUnverified.map((user) => (
                            <Grid item xs={12} sm={6} md={4} key={user._id}>
                              <SubAdminUserCard
                                user={user}
                                isUnverified
                                canUnassign={canUnassign}
                                onUnassign={onOpenModal}
                                onVerify={bypassSingleUser}
                                isVerifying={isUsers}
                              />
                            </Grid>
                          ))}
                        </Grid>
                      </Box>
                    )}
                  </>
                )}
              </Box>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={open} onClose={onCloseModal} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Unassign user</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Do you want to unassign{" "}
            <strong>
              {modalData.firstName} {modalData.lastName}
            </strong>{" "}
            from this subadmin?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={onCloseModal} variant="outlined">
            Cancel
          </Button>
          <Button
            onClick={() => deleteEachUser(modalData)}
            variant="contained"
            color="error"
            disabled={isDisable}
            startIcon={isDisable ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {isDisable ? "Unassigning..." : "Unassign"}
          </Button>
        </DialogActions>
      </Dialog>
    </AdminShell>
  );
};

export default SubAdminUsers;
