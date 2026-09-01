import React, { useEffect, useState, useCallback, useMemo } from "react";
import AdminShell from "./theme/AdminShell";
import AdminSkeleton from "./theme/AdminSkeleton";
import SideBar from "../layouts/AdminSidebar/Sidebar";
import { FiberManualRecord as DotIcon } from '@mui/icons-material';

import Log from "../../assets/images/img/log.jpg";
import {
  allUsersApi,
  bypassSingleUserApi,
  deleteEachUserApi,
  updateSignleUsersStatusApi,
  updateUserComplianceRestrictionApi,
  adminTicketsApi,
  addUserByEmailApi,
  importUsersAsLeadsApi,
  UnassignUserApi
} from "../../Api/Service";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuthUser } from "react-auth-kit";
import {
  Card,
  CardContent,
  CardHeader,
  Avatar,
  Typography,
  Box,
  Grid,
  Button,
  Chip,
  Switch,
  FormControlLabel,
  IconButton,
  Divider,
  CardActions,
  Badge,
  LinearProgress,
  TextField,
  MenuItem,
  Select,
  FormControl,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Pagination,
  InputAdornment,
  Paper,
  Stack,
  CircularProgress,
} from '@mui/material';
import {
  Person as PersonIcon,
  Email as EmailIcon,
  CalendarToday as CalendarIcon,
  ManageAccounts as ManageIcon,
  ContactMail as ContactIcon,
  Delete as DeleteIcon,
  Share as ShareIcon,
  Assignment as AssignmentIcon,
  CheckCircle as CheckIcon,
  VerifiedUser as VerifiedIcon,
  Warning as WarningIcon,
  Support as SupportIcon,
  Close as CloseIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Visibility as VisibilityIcon,
  Edit as EditIcon,
  Gavel as GavelIcon,
  LockOpen as LockOpenIcon,
  Upload as UploadIcon,
  SelectAll as SelectAllIcon,
  Deselect as DeselectIcon,
  Check as SelectCheckIcon,
  HourglassTop as HourglassTopIcon,
  PersonAdd as PersonAddIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
} from '@mui/icons-material';
import "react-responsive-modal/styles.css";
import { Modal } from "react-responsive-modal";
import AdminHeader from "./adminHeader";
import exportStyles from "./AdminUsersExport.module.css";
import userCardStyles from "./assets/AdminUserCards.module.css";
import usersStyles from "./AdminUsers.module.css";
import { getAssignedSubAdminIds, hasSubAdminAccessToUser } from "./assets/subAdminAssignment";
import "./assets/AdminUserCard.css";

const UsersPager = ({ page, limit, total, pages, onChange, tone = "verified", placement = "bottom" }) => {
  if (!total) return null;
  const start = ((page - 1) * limit) + 1;
  const end = Math.min(page * limit, total);
  return (
    <div
      className={`${usersStyles.bar} ${placement === "top" ? usersStyles.barTop : usersStyles.barBottom} ${
        tone === "unverified" ? usersStyles.barUnverified : usersStyles.barVerified
      }`}
    >
      <p className={usersStyles.meta}>
        Showing <span className={usersStyles.num}>{start}–{end}</span> of{" "}
        <span className={usersStyles.num}>{total}</span>{" "}
        {tone === "unverified" ? "unverified" : "verified"} users
      </p>
      {pages > 1 ? (
        <Pagination
          className={usersStyles.pager}
          count={pages}
          page={page}
          onChange={onChange}
          color="primary"
          size="medium"
          showFirstButton
          showLastButton
        />
      ) : null}
    </div>
  );
};

const CrmOutlineButton = ({ children, onClick, disabled, icon, variant = "primary" }) => (
  <button
    type="button"
    className={`${exportStyles.crmBtnBase} ${variant === "neutral" ? exportStyles.crmBtnNeutral : exportStyles.crmBtnPrimary}`}
    onClick={onClick}
    disabled={disabled}
  >
    <span className={exportStyles.crmBtnIcon}>{icon}</span>
    {children}
  </button>
);

const CrmExportButton = ({ children, onClick, disabled, loading, icon, title }) => (
  <button
    type="button"
    className={`${exportStyles.crmBtnBase} ${exportStyles.crmBtnExport}`}
    onClick={onClick}
    disabled={disabled}
    title={title}
  >
    {loading ? (
      <span className={exportStyles.crmBtnSpinner} aria-hidden="true" />
    ) : (
      <span className={exportStyles.crmBtnIcon}>{icon}</span>
    )}
    {children}
  </button>
);

const UserSelectCheckbox = ({ selected, onToggle }) => (
  <Box
    component="button"
    type="button"
    aria-label={selected ? 'Deselect user' : 'Select user'}
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      onToggle?.();
    }}
    sx={{
      position: 'absolute',
      top: 14,
      left: 14,
      zIndex: 5,
      width: 30,
      height: 30,
      borderRadius: 1.5,
      border: '2px solid',
      borderColor: selected ? '#42a5f5' : 'rgba(255,255,255,0.45)',
      bgcolor: selected ? 'linear-gradient(45deg, #1976d2, #42a5f5)' : 'rgba(0,0,0,0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      p: 0,
      boxShadow: selected
        ? '0 0 0 3px rgba(33, 150, 243, 0.28), 0 4px 12px rgba(0,0,0,0.35)'
        : '0 4px 12px rgba(0,0,0,0.35)',
      transition: 'all 0.2s ease',
      '&:hover': {
        borderColor: '#64b5f6',
        bgcolor: selected ? 'linear-gradient(45deg, #1565c0, #1e88e5)' : 'rgba(33, 150, 243, 0.22)',
      },
    }}
  >
    {selected && <SelectCheckIcon sx={{ fontSize: 18, color: '#fff', fontWeight: 700 }} />}
  </Box>
);

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

// Memoized UserCard component to prevent unnecessary re-renders
const UserCard = React.memo(({
  user,
  isUnverified = false,
  onDelete,
  onVerify,
  onRestrict,
  onUpdateShared,
  canViewClientDetails = true,
  canEditClientProfile = true,
  isSubadminViewer = false,
  userTicketsCount,
  subadmins,
  disabledIn,
  isUsers,
  isRestricting,
  authUser,
  selectable = false,
  selected = false,
  onToggleSelect,
  showCrmExport = false,
  onExportToCrm,
  isExportingToCrm = false,
  crmExportBusy = false,
  canAssign = false,
  onAssign,
  onUnassignFromSubadmin,
  unassigningKey = "",
}) => {
  const navigate = useNavigate();
  const getSubadminName = useCallback((subadminId) => {
    const subadmin = subadmins.find(sub => String(sub._id) === String(subadminId));
    return subadmin ? `${subadmin.firstName} ${subadmin.lastName}` : "Unknown Subadmin";
  }, [subadmins]);

  const openedTicketsCount = userTicketsCount[user._id] || 0;
  const kycStatus = getUserKycStatus(user);

  const renderAssignmentInfo = useCallback((user) => {
    if (user.isShared) {
      return (
        <div className="hui-assign hui-assign--shared">
          <span className="hui-assign-mark"><ShareIcon sx={{ fontSize: 18 }} /></span>
          <div className="hui-assign-copy">
            <p className="hui-assign-title">Shared with all subadmins</p>
            <p className="hui-assign-sub">Accessible to every subadmin</p>
          </div>
        </div>
      );
    }

    const assignedIds = getAssignedSubAdminIds(user);
    if (assignedIds.length > 0) {
      return (
        <div className="hui-assign hui-assign--filled">
          <div className="hui-assign-copy">
            <p className="hui-assign-title">
              {assignedIds.length === 1
                ? "Assigned to 1 subadmin"
                : `Assigned to ${assignedIds.length} subadmins`}
            </p>
            <p className="hui-assign-sub">Tap a name to open, or remove with ×</p>
          </div>
          <div className="hui-assign-chips">
            {assignedIds.map((subadminId) => {
              const isUnassigning = unassigningKey === `${user._id}:${subadminId}`;
              return (
                <div className="hui-assign-chip" key={subadminId}>
                  <button
                    type="button"
                    className="hui-assign-chip-name"
                    onClick={() => navigate(`/admin/subadmin/users/${subadminId}`)}
                  >
                    {getSubadminName(subadminId)}
                  </button>
                  {canAssign && (
                    <button
                      type="button"
                      className="hui-assign-chip-x"
                      disabled={isUnassigning}
                      aria-label={`Unassign from ${getSubadminName(subadminId)}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!isUnassigning) {
                          onUnassignFromSubadmin?.(user, subadminId);
                        }
                      }}
                    >
                      {isUnassigning
                        ? <CircularProgress size={10} sx={{ color: "inherit" }} />
                        : <CloseIcon />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="hui-assign hui-assign--empty">
        <span className="hui-assign-mark"><PersonAddIcon sx={{ fontSize: 18 }} /></span>
        <div className="hui-assign-copy">
          <p className="hui-assign-title">Not assigned</p>
          <p className="hui-assign-sub">No subadmin assigned yet</p>
        </div>
      </div>
    );
  }, [getSubadminName, canAssign, onUnassignFromSubadmin, unassigningKey, navigate]);

  return (
    <Card
      className={userCardStyles.card}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: 'translateY(-8px)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        borderRadius: 4,
        overflow: 'visible',
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'grey.800',
        borderTop: `3px solid ${kycStatus.accent}`,
        background: selected
          ? 'linear-gradient(135deg, #1a2332 0%, #2d3a4d 100%)'
          : 'linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%)',
        position: 'relative',
        '&:hover': {
          boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
          transform: 'translateY(-4px)'
        }
      }}
    >
      {selectable && (
        <UserSelectCheckbox
          selected={selected}
          onToggle={() => onToggleSelect?.(user._id)}
        />
      )}
      {/* Verification Status Ribbon */}
      <Box
        sx={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 2
        }}
      >
        <Badge
          badgeContent={
            user.verified ? (
              <VerifiedIcon sx={{ fontSize: 16, color: 'success.main' }} />
            ) : (
              <WarningIcon sx={{ fontSize: 16, color: 'warning.main' }} />
            )
          }
        >
          <Avatar
            src={Log}
            sx={{
              width: 70,
              height: 70,
              border: '4px solid',
              borderColor: 'grey.900',
              boxShadow: 3,
              bgcolor: user.verified ? 'success.dark' : 'warning.dark'
            }}
          >
            <PersonIcon />
          </Avatar>
        </Badge>
      </Box>

      {/* Card Header */}
      <CardHeader
        title={
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, pr: 9 }}>
            <Link
              to={`/admin/users/${user._id}?tab=compliance`}
              className={`hui-chip hui-chip--${kycStatus.key}${selectable ? " hui-chip--selectable" : ""}`}
              title={kycStatus.label}
            >
              <span className="hui-chip-icon">{kycStatus.icon}</span>
              {kycStatus.label}
            </Link>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h6" fontWeight="700" sx={{
              background: 'linear-gradient(45deg, #64b5f6, #42a5f5)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              {user.firstName} {user.lastName}
            </Typography>
            {user.online ? (
              <div style={{
                color: 'green', backgroundColor: "green", width: "8px", height: "8px", borderRadius: "50%"
                , boxShadow: '0 0 8px rgba(76, 175, 80, 0.7)', animation: 'pulse 2s infinite green'
              }}
              >
              </div>
            ) : ""}
            </Box>
          </Box>
        }
        subheader={
          <Box Box sx={{ mt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
              <EmailIcon sx={{ fontSize: 16, mr: 1, color: 'grey.400' }} />
              <Typography variant="body2" color="grey.400" noWrap>
                {user.email}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <CalendarIcon sx={{ fontSize: 14, mr: 1, color: 'grey.500' }} />
              <Typography variant="caption" color="grey.500">
                Joined {new Date(user.createdAt).toLocaleDateString()}
              </Typography>
            </Box>
            {user.online ?
              <OnlineStatus isOnline={user.online || null} /> :

              <Typography style={{ display: 'flex' }} variant="caption" color="grey.500">

                Last Online:<OnlineStatus isOnline={user.online || null} lastOnline={user.lastOnline || null} />
              </Typography>
            }
            {
              openedTicketsCount > 0 && (
                <Chip
                  icon={<SupportIcon />}
                  label={`${openedTicketsCount} Open Ticket${openedTicketsCount > 1 ? 's' : ''}`}
                  size="small"
                  color="error"
                  variant="filled"
                  sx={{
                    fontSize: '0.7rem',
                    height: '24px',
                    marginTop: "10px",
                    backgroundColor: 'error.dark',
                    color: 'white'
                  }}
                />
              )
            }
            {user.isComplianceRestricted && (
              <Chip
                icon={<GavelIcon sx={{ fontSize: '14px !important' }} />}
                label="Compliance Review"
                size="small"
                sx={{
                  fontSize: '0.7rem',
                  height: '24px',
                  marginTop: "10px",
                  ml: openedTicketsCount > 0 ? 1 : 0,
                  backgroundColor: '#8b0000',
                  color: 'white',
                  border: '1px solid rgba(255,255,255,0.2)',
                }}
              />
            )}
          </Box >

        }
        sx={{
          pt: selectable ? 1.25 : 3,
          pb: 1,
          pl: selectable ? 7 : 2,
          pr: 2,
          '& .MuiCardHeader-content': {
            overflow: 'hidden'
          }
        }}
      />

      < Divider sx={{ mx: 2, bgcolor: 'grey.700' }} />

      < CardContent sx={{ flexGrow: 1, pt: 2 }}>
        {/* Assignment Information */}
        {
          (authUser.role === "admin" || authUser.role === "superadmin") && (
            <>
              {renderAssignmentInfo(user)}
              <Box className={userCardStyles.shareBox} sx={{ mb: 2, p: 1.5, bgcolor: 'grey.800', borderRadius: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={user.isShared || false}
                      onChange={(e) => onUpdateShared(user._id, e.target.checked)}
                      disabled={disabledIn}
                      color="primary"
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': {
                          color: 'primary.main',
                        },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                          backgroundColor: 'primary.main',
                        },
                      }}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="subtitle2" fontWeight="600" color="grey.200">
                        Global Sharing
                      </Typography>
                      <Typography variant="caption" color="grey.400">
                        Share with all subadmins
                      </Typography>
                    </Box>
                  }
                  sx={{ width: '100%', mx: 0 }}
                />
              </Box>
            </>
          )
        }
      </CardContent >

      <Divider sx={{ mx: 2, bgcolor: 'grey.700' }} />

      {/* Action Buttons */}
      <CardActions sx={{ p: 2, gap: 1 }}>
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          width: '100%'
        }}>
          {/* First Row - Always visible buttons */}
          <Box sx={{ display: 'flex', gap: 1, width: '100%', flexWrap: 'wrap' }}>
            <Button
              component={Link}
              to={isSubadminViewer ? `/admin/users/${user._id}?tab=assets` : `/admin/users/${user._id}`}
              variant="contained"
              startIcon={<ManageIcon />}
              size="small"
              sx={{
                flex: 1,
                minWidth: '120px',
                borderRadius: 3,
                textTransform: 'none',
                fontWeight: '600',
                py: 1,
                minHeight: '40px',
                background: 'linear-gradient(45deg, #1976d2, #42a5f5)',
                boxShadow: '0 4px 15px rgba(25, 118, 210, 0.3)',
                '&:hover': {
                  background: 'linear-gradient(45deg, #1565c0, #1e88e5)'
                }
              }}
            >
              {isSubadminViewer ? 'Manage Assets' : 'Manage'}
            </Button>

            {isSubadminViewer && canViewClientDetails && (
              <Button
                component={Link}
                to={`/admin/users/${user._id}`}
                variant="outlined"
                startIcon={<VisibilityIcon />}
                size="small"
                sx={{
                  flex: 1,
                  minWidth: '120px',
                  borderRadius: 3,
                  textTransform: 'none',
                  fontWeight: '600',
                  py: 1,
                  minHeight: '40px',
                  borderColor: 'info.main',
                  color: 'info.main',
                  '&:hover': {
                    backgroundColor: 'info.dark',
                    borderColor: 'info.light'
                  }
                }}
              >
                Personal Details
              </Button>
            )}

            {isSubadminViewer && canViewClientDetails && canEditClientProfile && (
              <Button
                component={Link}
                to={`/admin/users/${user._id}?tab=overview&edit=1`}
                variant="outlined"
                startIcon={<EditIcon />}
                size="small"
                sx={{
                  flex: 1,
                  minWidth: '120px',
                  borderRadius: 3,
                  textTransform: 'none',
                  fontWeight: '600',
                  py: 1,
                  minHeight: '40px',
                  borderColor: 'success.main',
                  color: 'success.main',
                  '&:hover': {
                    backgroundColor: 'success.dark',
                    borderColor: 'success.light'
                  }
                }}
              >
                Edit Details
              </Button>
            )}

            <Button
              component={Link}
              to={`/admin/createTicket/${user._id}/${user.email}`}
              variant="outlined"
              startIcon={<ContactIcon />}
              className={userCardStyles.contactBtn}
              style={{ color: 'white' }}
              size="small"
              sx={{
                flex: 1,
                borderRadius: 3,
                textTransform: 'none',
                fontWeight: '500',
                py: 1,
                minHeight: '40px',
                borderColor: 'secondary.main',
                color: 'secondary.main',
                '&:hover': {
                  backgroundColor: 'secondary.dark',
                  borderColor: 'secondary.light',
                  transform: 'translateY(-1px)'
                }
              }}
            >
              Contact
            </Button>
          </Box>

          {/* Second Row - Conditional buttons */}
          <Box sx={{ display: 'flex', gap: 1, width: '100%', flexDirection: 'column' }}>
            {/* Verify Email Button */}
            {isUnverified && (
              <Button
                variant="contained"
                color="warning"
                startIcon={<CheckIcon />}
                size="small"
                disabled={isUsers}
                onClick={() => onVerify(user)}
                sx={{
                  width: '100%',
                  borderRadius: 3,
                  textTransform: 'none',
                  fontWeight: '600',
                  py: 1,
                  minHeight: '40px',
                  backgroundColor: 'warning.dark',
                  '&:hover': {
                    backgroundColor: 'warning.main'
                  }
                }}
              >
                Verify Email
              </Button>
            )}

            {canAssign && (
              <Button
                className="hui-assign-btn"
                variant="outlined"
                startIcon={<PersonAddIcon />}
                size="small"
                disabled={Boolean(user.isShared)}
                onClick={() => onAssign?.(user)}
                title={user.isShared ? "Shared users are already visible to all subadmins" : "Assign this user to one or more subadmins"}
                sx={{
                  width: '100%',
                  borderRadius: 3,
                  textTransform: 'none',
                  fontWeight: '600',
                  py: 1,
                  minHeight: '40px',
                  color: '#ffffff !important',
                  borderColor: '#42a5f5 !important',
                  '& .MuiButton-startIcon, & .MuiButton-startIcon *': {
                    color: '#ffffff !important',
                  },
                }}
              >
                Assign to Subadmin
              </Button>
            )}

            {/* Restrict / Unrestrict Button */}
            {(authUser.role === "admin" || authUser.role === "superadmin") && (
              <Button
                variant={user.isComplianceRestricted ? "contained" : "outlined"}
                startIcon={user.isComplianceRestricted ? <LockOpenIcon /> : <GavelIcon />}
                size="small"
                disabled={isRestricting}
                className={user.isComplianceRestricted ? undefined : userCardStyles.outlineBtn}
                style={{ color: 'white' }}
                onClick={() => onRestrict(user)}
                sx={{
                  width: '100%',
                  borderRadius: 3,
                  textTransform: 'none',
                  fontWeight: '600',
                  py: 1,
                  minHeight: '40px',
                  ...(user.isComplianceRestricted
                    ? {
                        backgroundColor: 'success.dark',
                        color: 'white',
                        '&:hover': { backgroundColor: 'success.main', color:"white" },
                      }
                    : {
                        borderWidth: 2,
                        borderColor: '#8b0000',
                        color: '#ef9a9a',
                        '&:hover': {
                          borderWidth: 2,
                          backgroundColor: 'rgba(139, 0, 0, 0.2)',
                          borderColor: '#ef5350',
                          color:"white"
                        },
                      }),
                }}
              >
                {user.isComplianceRestricted ? 'Remove Restriction' : 'Restrict Account'}
              </Button>
            )}

            {showCrmExport && (
              <div className={exportStyles.crmCardExport}>
                <button
                  type="button"
                  className={`${exportStyles.crmBtnBase} ${exportStyles.crmBtnExport}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onExportToCrm?.(user);
                  }}
                  disabled={crmExportBusy}
                  title="Create a CRM lead from this wallet user"
                >
                  {isExportingToCrm ? (
                    <span className={exportStyles.crmBtnSpinner} aria-hidden="true" />
                  ) : (
                    <span className={exportStyles.crmBtnIcon}><UploadIcon /></span>
                  )}
                  {isExportingToCrm ? 'Exporting...' : 'Export to CRM'}
                </button>
              </div>
            )}

            {/* Delete Button */}
            {(authUser.role === "admin" || authUser.role === "superadmin") && (
              <Button
                variant="outlined"
                color="primary.light"
                className={userCardStyles.outlineBtn}
                style={{ color: 'white' }}
                startIcon={<DeleteIcon />}
                size="small"
                onClick={() => onDelete(user)}
                sx={{
                  width: '100%',
                  borderRadius: 3,
                  textTransform: 'none',
                  fontWeight: '500',
                  py: 1,
                  minHeight: '40px',
                  borderWidth: 2,
                  borderColor: 'error.dark',
                  '&:hover': {
                    borderWidth: 2,
                    backgroundColor: 'error.dark',
                    borderColor: 'error.light'
                  }
                }}
              >
                Delete
              </Button>
            )}
          </Box>
        </Box>
      </CardActions>
    </Card >
  );
});
const formatLastOnline = (lastOnline) => {
  if (!lastOnline) return 'Never';

  const now = new Date();
  const lastOnlineDate = new Date(lastOnline);
  const diffInMs = now - lastOnlineDate;
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInHours < 24) return `${diffInHours}h ago`;
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays}d ago`;

  return lastOnlineDate.toLocaleDateString();
};

// Online Status Indicator Component
const OnlineStatus = ({ isOnline, lastOnline }) => {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <DotIcon
        sx={{
          fontSize: 12,
          color: isOnline ? 'success.main' : 'grey.500',
          filter: isOnline ? 'drop-shadow(0 0 4px rgba(76, 175, 80, 0.5))' : 'none'
        }}
      />
      <Typography
        variant="caption"
        sx={{
          color: isOnline ? 'success.main' : 'grey.500',
          fontWeight: isOnline ? 600 : 400
        }}
      >
        {isOnline ? 'Online' : formatLastOnline(lastOnline)}
      </Typography>
    </Box>
  );
};
const AdminUsers = () => {
  const [Users, setUsers] = useState([]);
  const [unVerified, setunVerified] = useState([]);
  const [open, setOpen] = useState(false);
  const [modalData, setmodalData] = useState({});
  const [restrictModalOpen, setRestrictModalOpen] = useState(false);
  const [restrictModalData, setRestrictModalData] = useState({});
  const [isRestricting, setIsRestricting] = useState(false);
  const [isDisable, setisDisable] = useState(false);
  const [isUsers, setisUsers] = useState(false);
  const [subadmins, setSubadmins] = useState([]);
  const [active, setActive] = useState(false);
  const [disabledIn, setdisabledIn] = useState(false);
  const [isLoading, setisLoading] = useState(true);
  const [subadminClientPermissions, setSubadminClientPermissions] = useState({
    canViewClientDetails: false,
    canEditClientProfile: false,
  });
  const [userTicketsCount, setUserTicketsCount] = useState({});

  // New state for assign user modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignEmail, setAssignEmail] = useState("");
  const [assignTarget, setAssignTarget] = useState({ type: "email" });
  const [selectedSubadmins, setSelectedSubadmins] = useState([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [subadminError, setSubadminError] = useState("");
  const [unassignConfirm, setUnassignConfirm] = useState(null);
  const [unassigningKey, setUnassigningKey] = useState("");
  const [subadminPickerOpen, setSubadminPickerOpen] = useState(false);

  // Pagination and filter states
  const [searchInput, setSearchInput] = useState(""); // Temporary input value
  const [searchQuery, setSearchQuery] = useState(""); // Actual search query used for API
  const [verifiedFilter, setVerifiedFilter] = useState(""); // '', 'true', 'false'
  const [onlineFilter, setOnlineFilter] = useState(""); // '', 'online', 'offline'
  const [sortBy, setSortBy] = useState("createdAt"); // 'createdAt', 'lastOnline'
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 1
  });
  const [unverifiedPagination, setUnverifiedPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 1
  });
  const [loadingUsers, setLoadingUsers] = useState(false);

  const authUser = useAuthUser();
  const Navigate = useNavigate();
  const currentAuthUser = authUser();
  const isSubadmin = currentAuthUser.user.role === "subadmin";
  const isSuperAdmin = currentAuthUser.user.role === "superadmin";
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [exportingToCrm, setExportingToCrm] = useState(false);
  const [exportingUserId, setExportingUserId] = useState(null);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);

  // Memoize filtered subadmins
  const filteredSubadmins = useMemo(() =>
    subadmins.filter(subadmin => subadmin.role.includes("subadmin")),
    [subadmins]
  );

  const toggleUserSelection = useCallback((userId) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  const handleSelectAllVisibleUsers = useCallback(() => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      Users.forEach((user) => next.add(user._id));
      unVerified.forEach((user) => next.add(user._id));
      return next;
    });
  }, [Users, unVerified]);

  const handleClearUserSelection = useCallback(() => {
    setSelectedUserIds(new Set());
  }, []);

  const exportUsersToCrm = useCallback(async (userIds, { clearSelection = false } = {}) => {
    if (!userIds.length) {
      toast.error('Select at least one user to export');
      return;
    }

    const isSingleExport = userIds.length === 1;

    try {
      setExportingToCrm(true);
      if (isSingleExport) {
        setExportingUserId(userIds[0]);
      }
      const response = await importUsersAsLeadsApi(userIds);
      if (response.success) {
        toast.success(response.msg || 'Users exported to CRM successfully');
        if (clearSelection) {
          setSelectedUserIds(new Set());
          setExportConfirmOpen(false);
        }
      } else {
        toast.error(response.msg || 'Failed to export users to CRM');
      }
    } catch (error) {
      console.error('Export users to CRM error:', error);
      toast.error(error?.response?.data?.msg || error?.message || 'Failed to export users to CRM');
    } finally {
      setExportingToCrm(false);
      setExportingUserId(null);
    }
  }, []);

  const handleExportUsersToCrm = useCallback(async () => {
    await exportUsersToCrm([...selectedUserIds], { clearSelection: true });
  }, [selectedUserIds, exportUsersToCrm]);

  const handleExportSingleUserToCrm = useCallback((user) => {
    const displayName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
    if (!window.confirm(`Export "${displayName}" to CRM as a lead?`)) {
      return;
    }
    exportUsersToCrm([user._id]);
  }, [exportUsersToCrm]);

  // Fetch tickets with useCallback to prevent recreation
  const fetchTickets = useCallback(async () => {
    try {
      const allTickets = await adminTicketsApi();

      if (allTickets.success) {
        const ticketsCount = {};
        allTickets.tickets.forEach(ticket => {
          if (ticket.status === 'open' || ticket.status === 'opened') {
            ticketsCount[ticket.user] = (ticketsCount[ticket.user] || 0) + 1;
          }
        });
        setUserTicketsCount(ticketsCount);
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
    }
  }, []);

  // Optimized getAllUsers function with pagination
  const [isAssignUser, setisAssignUser] = useState(false);
  const canAssignUsers = isSuperAdmin || (currentAuthUser.user.role === "admin" && Boolean(isAssignUser));
  const getAllUsers = useCallback(async (isVerified = true, pageOverride = null) => {
    try {
      setLoadingUsers(true);
      const currentUser = currentAuthUser.user;
      
      // For subadmin, fetch all (frontend filtering)
      if (isSubadmin) {
        const allUsers = await allUsersApi({});

        if (!allUsers.success) {
          toast.error(allUsers.msg);
          return;
        }

        const allSubadmins = allUsers.allUsers.filter(user => user.role.includes("subadmin"));
        setSubadmins(allSubadmins);

        const filterSubadmin = allUsers.allUsers.find(user => currentUser._id === user._id);
        setSubadminClientPermissions({
          canViewClientDetails: filterSubadmin?.permissions?.viewClientDetails === true,
          canEditClientProfile: filterSubadmin?.permissions?.editUserProfile === true,
        });

        // Frontend filtering for subadmin
        let filtered = allUsers.allUsers.filter(user =>
          user.role === "user" && user.verified === true &&
          hasSubAdminAccessToUser(user, currentUser._id)
        );

        let unverified = allUsers.allUsers.filter(user =>
          user.role === "user" && user.verified === false &&
          hasSubAdminAccessToUser(user, currentUser._id)
        );

        // Apply search filter on frontend
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          filtered = filtered.filter(user =>
            user.firstName?.toLowerCase().includes(query) ||
            user.lastName?.toLowerCase().includes(query) ||
            user.email?.toLowerCase().includes(query)
          );
          unverified = unverified.filter(user =>
            user.firstName?.toLowerCase().includes(query) ||
            user.lastName?.toLowerCase().includes(query) ||
            user.email?.toLowerCase().includes(query)
          );
        }

        // Apply online filter on frontend
        if (onlineFilter === 'online') {
          filtered = filtered.filter(user => user.online === true);
          unverified = unverified.filter(user => user.online === true);
        } else if (onlineFilter === 'offline') {
          filtered = filtered.filter(user => user.online !== true);
          unverified = unverified.filter(user => user.online !== true);
        }

        // Apply sorting
        if (sortBy === 'lastOnline') {
          filtered.sort((a, b) => {
            const aTime = a.lastOnline ? new Date(a.lastOnline).getTime() : 0;
            const bTime = b.lastOnline ? new Date(b.lastOnline).getTime() : 0;
            return bTime - aTime; // Most recent first
          });
          unverified.sort((a, b) => {
            const aTime = a.lastOnline ? new Date(a.lastOnline).getTime() : 0;
            const bTime = b.lastOnline ? new Date(b.lastOnline).getTime() : 0;
            return bTime - aTime;
          });
        } else {
          filtered.reverse();
          unverified.reverse();
        }

        setUsers(filtered);
        setunVerified(unverified);
        setPagination(prev => ({ ...prev, total: filtered.length, pages: 1 }));
        setUnverifiedPagination(prev => ({ ...prev, total: unverified.length, pages: 1 }));
        return;
      }

      // For admin/superadmin, use backend pagination
      const currentPage = pageOverride || (isVerified ? pagination.page : unverifiedPagination.page);
      const currentLimit = isVerified ? pagination.limit : unverifiedPagination.limit;

      const params = {
        page: currentPage,
        limit: currentLimit,
        role: 'user',
        verified: String(isVerified),
        sortBy: sortBy,
        sortOrder: sortBy === 'lastOnline' ? 'desc' : 'desc'
      };

      // Add search if exists
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      // Add online filter if exists
      if (onlineFilter === 'online') {
        params.online = 'true';
      } else if (onlineFilter === 'offline') {
        params.online = 'false';
      }

      const response = await allUsersApi(params);

      if (!response.success) {
        toast.error(response.msg);
        return;
      }

      // Also fetch subadmins on first load
      if (isVerified && currentPage === 1) {
        const subadminResponse = await allUsersApi({ role: 'subadmin', limit: 1000 });
        if (subadminResponse.success) {
          setSubadmins(subadminResponse.allUsers);
        }
      }

      // Check admin permissions
      if (currentUser.role === "admin" && isVerified && currentPage === 1) {
        const filterAdmin = response.allUsers.find(user => currentUser._id === user._id) ||
          (await allUsersApi({ search: currentUser.email, limit: 1 }))?.allUsers?.[0];
        setisAssignUser(filterAdmin?.adminPermissions?.isAddUsersToSubAdmin);
      }

      // Update state based on verified status
      if (isVerified) {
        setUsers(response.allUsers);
        setPagination({
          page: response.pagination.page,
          limit: response.pagination.limit,
          total: response.pagination.total,
          pages: response.pagination.pages
        });
      } else {
        setunVerified(response.allUsers);
        setUnverifiedPagination({
          page: response.pagination.page,
          limit: response.pagination.limit,
          total: response.pagination.total,
          pages: response.pagination.pages
        });
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error(error.message || "Error fetching users");
    } finally {
      setLoadingUsers(false);
    }
  }, [currentAuthUser, isSubadmin, pagination.page, pagination.limit, unverifiedPagination.page, unverifiedPagination.limit, searchQuery, onlineFilter, sortBy]);

  const patchUserInLists = useCallback((userId, patch) => {
    const target = String(userId);
    const apply = (user) => (String(user._id) === target ? { ...user, ...patch } : user);
    setUsers((prev) => prev.map(apply));
    setunVerified((prev) => prev.map(apply));
  }, []);

  const removeUserFromLists = useCallback((userId, wasVerified) => {
    const target = String(userId);
    const keep = (user) => String(user._id) !== target;
    setUsers((prev) => prev.filter(keep));
    setunVerified((prev) => prev.filter(keep));
    if (wasVerified) {
      setPagination((prev) => ({ ...prev, total: Math.max(0, (prev.total || 0) - 1) }));
    } else {
      setUnverifiedPagination((prev) => ({ ...prev, total: Math.max(0, (prev.total || 0) - 1) }));
    }
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      next.forEach((id) => {
        if (String(id) === target) {
          next.delete(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, []);

  const moveUserToVerifiedList = useCallback((user) => {
    const target = String(user._id);
    const verifiedUser = { ...user, verified: true };
    setunVerified((prev) => prev.filter((item) => String(item._id) !== target));
    setUsers((prev) => (
      prev.some((item) => String(item._id) === target) ? prev : [verifiedUser, ...prev]
    ));
    setUnverifiedPagination((prev) => ({ ...prev, total: Math.max(0, (prev.total || 0) - 1) }));
    setPagination((prev) => ({ ...prev, total: (prev.total || 0) + 1 }));
  }, []);

  // Event handlers with useCallback
  const deleteEachUser = useCallback(async (user) => {
    try {
      setisDisable(true);
      const allUsers = await deleteEachUserApi(user._id);
      if (allUsers.success) {
        toast.success(allUsers.msg);
        setOpen(false);
        removeUserFromLists(user._id, user.verified === true);
      } else {
        toast.error(allUsers.msg);
        setOpen(false);
      }
    } catch (error) {
      toast.error(error.message || "Error deleting user");
    } finally {
      setisDisable(false);
    }
  }, [removeUserFromLists]);

  const bypassSingleUser = useCallback(async (user) => {
    try {
      setisUsers(true);
      const signleUser = await bypassSingleUserApi(user._id);
      if (signleUser.success) {
        moveUserToVerifiedList(user);
        toast.success(signleUser.msg);
      } else {
        toast.error(signleUser.msg);
      }
    } catch (error) {
      toast.error(error.message || "Error verifying user");
    } finally {
      setisUsers(false);
    }
  }, [moveUserToVerifiedList]);

  const updateUserIsShared = useCallback(async (userId, isShared) => {
    try {
      setdisabledIn(true);
      const updatedUser = await updateSignleUsersStatusApi(userId, { isShared });
      if (updatedUser.success) {
        toast.success("User status updated successfully");
        patchUserInLists(userId, { isShared });
      } else {
        toast.error(updatedUser.msg);
      }
    } catch (error) {
      toast.error("Error updating user status");
    } finally {
      setdisabledIn(false);
    }
  }, [patchUserInLists]);

  const onOpenModal = useCallback((user) => {
    setOpen(true);
    setmodalData(user);
  }, []);

  const onCloseModal = useCallback(() => setOpen(false), []);

  const onOpenRestrictModal = useCallback((user) => {
    setRestrictModalOpen(true);
    setRestrictModalData(user);
  }, []);

  const onCloseRestrictModal = useCallback(() => {
    setRestrictModalOpen(false);
    setRestrictModalData({});
  }, []);

  const handleComplianceRestriction = useCallback(async (user) => {
    const nextRestricted = !user.isComplianceRestricted;

    try {
      setIsRestricting(true);
      const response = await updateUserComplianceRestrictionApi(user._id, {
        isComplianceRestricted: nextRestricted,
      });

      if (response.success) {
        toast.success(response.msg);
        patchUserInLists(user._id, {
          isComplianceRestricted: nextRestricted,
          complianceRestrictedAt: nextRestricted ? new Date().toISOString() : null,
        });
        onCloseRestrictModal();
      } else {
        toast.error(response.msg || "Failed to update compliance restriction");
      }
    } catch (error) {
      toast.error(error.message || "Error updating compliance restriction");
    } finally {
      setIsRestricting(false);
    }
  }, [patchUserInLists, onCloseRestrictModal]);

  // Assign modal functions
  const openAssignModal = useCallback(() => {
    setAssignTarget({ type: "email" });
    setAssignModalOpen(true);
    setAssignEmail("");
    setSelectedSubadmins([]);
    setEmailError("");
    setSubadminError("");
    setSubadminPickerOpen(false);
  }, []);

  const openAssignModalForUser = useCallback((user) => {
    if (user?.isShared) {
      toast.error("Shared users are already visible to all subadmins");
      return;
    }
    setAssignTarget({
      type: "user",
      userId: user._id,
      email: user.email,
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
    });
    setAssignModalOpen(true);
    setAssignEmail(user.email || "");
    setSelectedSubadmins([]);
    setEmailError("");
    setSubadminError("");
    setSubadminPickerOpen(false);
  }, []);

  const openAssignModalForSelected = useCallback(() => {
    if (selectedUserIds.size === 0) {
      toast.error("Select at least one user");
      return;
    }
    setAssignTarget({ type: "bulk", count: selectedUserIds.size });
    setAssignModalOpen(true);
    setAssignEmail("");
    setSelectedSubadmins([]);
    setEmailError("");
    setSubadminError("");
    setSubadminPickerOpen(false);
  }, [selectedUserIds]);

  const closeAssignModal = useCallback(() => {
    setAssignModalOpen(false);
    setAssignTarget({ type: "email" });
    setAssignEmail("");
    setSelectedSubadmins([]);
    setEmailError("");
    setSubadminError("");
    setIsAssigning(false);
    setSubadminPickerOpen(false);
  }, []);

  const toggleSelectedSubadmin = useCallback((subadminId) => {
    setSelectedSubadmins((prev) => (
      prev.includes(subadminId)
        ? prev.filter((id) => id !== subadminId)
        : [...prev, subadminId]
    ));
    setSubadminError("");
  }, []);

  const validateEmail = useCallback((email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }, []);

  const applyLocalAssign = useCallback((userIds, emails, subAdminIds) => {
    const targetIds = new Set((userIds || []).map((id) => String(id || "")).filter(Boolean));
    const targetEmails = new Set(
      (emails || []).map((email) => String(email || "").trim().toLowerCase()).filter(Boolean)
    );
    const newSubIds = [...new Set((subAdminIds || []).map((id) => String(id || "")).filter(Boolean))];
    if (newSubIds.length === 0 || (targetIds.size === 0 && targetEmails.size === 0)) return;

    const patchUser = (user) => {
      const matchesId = targetIds.has(String(user._id));
      const matchesEmail = targetEmails.has(String(user.email || "").toLowerCase());
      if (!matchesId && !matchesEmail) return user;
      if (user.isShared) return user;

      const existing = getAssignedSubAdminIds(user);
      const seen = new Set(existing);
      const merged = [...existing];
      newSubIds.forEach((id) => {
        if (seen.has(id)) return;
        seen.add(id);
        merged.push(id);
      });

      return {
        ...user,
        assignedSubAdmins: merged,
        assignedSubAdmin: merged[0] || null,
      };
    };

    setUsers((prev) => prev.map(patchUser));
    setunVerified((prev) => prev.map(patchUser));
  }, []);

  const handleAssignUser = useCallback(async () => {
    setEmailError("");
    setSubadminError("");

    let isValid = true;
    if (assignTarget.type === "email") {
      if (!assignEmail.trim()) {
        setEmailError("Email is required");
        isValid = false;
      } else if (!validateEmail(assignEmail)) {
        setEmailError("Please enter a valid email address");
        isValid = false;
      }
    }

    if (!selectedSubadmins.length) {
      setSubadminError("Please select at least one subadmin");
      isValid = false;
    }

    if (!isValid) return;

    setIsAssigning(true);
    try {
      const body = {
        id: selectedSubadmins[0],
        ids: selectedSubadmins,
      };

      if (assignTarget.type === "bulk") {
        body.userIds = [...selectedUserIds];
      } else if (assignTarget.type === "user") {
        body.userIds = [assignTarget.userId];
        body.email = assignTarget.email;
      } else {
        body.email = assignEmail;
      }

      const response = await addUserByEmailApi(body);

      if (response.success) {
        toast.success(response.msg || "User assigned to subadmin successfully");
        const assignedUserIds = assignTarget.type === "bulk"
          ? [...selectedUserIds]
          : assignTarget.type === "user"
            ? [assignTarget.userId]
            : [];
        const assignedEmails = assignTarget.type === "email"
          ? [assignEmail]
          : assignTarget.type === "user"
            ? [assignTarget.email]
            : [];
        applyLocalAssign(assignedUserIds, assignedEmails, selectedSubadmins);
        if (assignTarget.type === "bulk") {
          setSelectedUserIds(new Set());
        }
        closeAssignModal();
      } else {
        toast.error(response.msg || "Failed to assign user to subadmin");
      }
    } catch (error) {
      toast.error("Error assigning user to subadmin");
      console.error("Assignment error:", error);
    } finally {
      setIsAssigning(false);
    }
  }, [assignEmail, assignTarget, selectedSubadmins, selectedUserIds, validateEmail, applyLocalAssign, closeAssignModal]);

  const requestUnassignFromSubadmin = useCallback((user, subAdminId) => {
    const subadmin = subadmins.find((sub) => String(sub._id) === String(subAdminId));
    const name = subadmin ? `${subadmin.firstName} ${subadmin.lastName}` : "this subadmin";
    setUnassignConfirm({
      user,
      subAdminId,
      name,
    });
  }, [subadmins]);

  const closeUnassignConfirm = useCallback(() => {
    if (!unassigningKey) {
      setUnassignConfirm(null);
    }
  }, [unassigningKey]);

  const applyLocalUnassign = useCallback((userId, subAdminId) => {
    const targetUser = String(userId);
    const targetSub = String(subAdminId);
    const patchUser = (user) => {
      if (String(user._id) !== targetUser) return user;
      const remaining = getAssignedSubAdminIds(user).filter((id) => id !== targetSub);
      return {
        ...user,
        assignedSubAdmins: remaining,
        assignedSubAdmin: remaining[0] || null,
      };
    };
    setUsers((prev) => prev.map(patchUser));
    setunVerified((prev) => prev.map(patchUser));
  }, []);

  const confirmUnassignFromSubadmin = useCallback(async () => {
    if (!unassignConfirm?.user?._id || !unassignConfirm?.subAdminId) return;
    const key = `${unassignConfirm.user._id}:${unassignConfirm.subAdminId}`;
    setUnassigningKey(key);
    try {
      const response = await UnassignUserApi(unassignConfirm.user._id, unassignConfirm.subAdminId);
      if (response.success) {
        toast.success(response.msg || "User unassigned successfully");
        setUnassignConfirm(null);
        applyLocalUnassign(unassignConfirm.user._id, unassignConfirm.subAdminId);
      } else {
        toast.error(response.msg || "Failed to unassign user");
      }
    } catch (error) {
      toast.error("Error unassigning user");
      console.error("Unassign error:", error);
    } finally {
      setUnassigningKey("");
    }
  }, [unassignConfirm, applyLocalUnassign]);

  const toggleBar = useCallback(() => setActive(prev => !prev), []);

  // Search input handler (just updates input, doesn't trigger search)
  const handleSearchInputChange = useCallback((e) => {
    setSearchInput(e.target.value);
  }, []);

  // Manual search button handler
  const handleSearchClick = useCallback(() => {
    setSearchQuery(searchInput);
    setPagination(prev => ({ ...prev, page: 1 }));
    setUnverifiedPagination(prev => ({ ...prev, page: 1 }));
  }, [searchInput]);

  // Handle Enter key in search input
  const handleSearchKeyPress = useCallback((e) => {
    if (e.key === 'Enter') {
      handleSearchClick();
    }
  }, [handleSearchClick]);

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchInput("");
    setSearchQuery("");
    setPagination(prev => ({ ...prev, page: 1 }));
    setUnverifiedPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  // Pagination handlers
  const handleVerifiedPageChange = useCallback((event, newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  }, []);

  const handleUnverifiedPageChange = useCallback((event, newPage) => {
    setUnverifiedPagination(prev => ({ ...prev, page: newPage }));
  }, []);

  // Initial data loading
  useEffect(() => {
    if (currentAuthUser.user.role === "user") {
      Navigate("/dashboard");
      return;
    }

    const loadData = async () => {
      setisLoading(true);
      try {
        await fetchTickets();
        // Load both verified and unverified users
        await getAllUsers(true, 1);
        await getAllUsers(false, 1);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setisLoading(false);
      }
    };

    loadData();
  }, [currentAuthUser, Navigate, fetchTickets]);

  // Reload users when pagination changes
  useEffect(() => {
    if (!isLoading) {
      getAllUsers(true);
    }
  }, [pagination.page]);

  useEffect(() => {
    if (!isLoading) {
      getAllUsers(false);
    }
  }, [unverifiedPagination.page]);

  // Reload users when search query changes (triggered by search button)
  useEffect(() => {
    if (!isLoading && searchQuery !== undefined) {
      getAllUsers(true);
      getAllUsers(false);
    }
  }, [searchQuery]);

  // Reload users when filters change
  useEffect(() => {
    if (!isLoading) {
      getAllUsers(true);
      getAllUsers(false);
    }
  }, [onlineFilter, sortBy]);

  // Render loading state
  if (isLoading) {
    return (
      <AdminShell><div className="admin dark-new-ui">
        <div className="bg-gray-900 min-h-screen">
          <SideBar state={active} toggle={toggleBar} />

          <AdminHeader toggle={toggleBar} pageName="Users Management" />
          <div className="bg-gray-900 relative min-h-screen w-full overflow-x-hidden px-4 transition-all duration-300 xl:px-10 lg:max-w-[calc(100%_-_280px)] lg:ms-[280px]">
            <Box sx={{ width: '100%', p: 4 }}>
              <AdminSkeleton variant="cards" rows={3} />
            </Box>
          </div>
        </div>
      </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
    <div className="admin dark-new-ui">
      <div className="bg-gray-900 min-h-screen">
        <SideBar state={active} toggle={toggleBar} />
        <div className="bg-gray-900 relative min-h-screen w-full overflow-x-hidden px-4 transition-all duration-300 xl:px-10 lg:max-w-[calc(100%_-_280px)] lg:ms-[280px]">
          <div className="mx-auto w-full max-w-7xl">
            <AdminHeader toggle={toggleBar} pageName="Users Management" />

            <Box sx={{ px: { xs: 2, md: 4 }, py: 3 }}>
              {/* Stats Cards Row */}
              <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{ 
                    background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a8c 100%)',
                    border: '1px solid rgba(66, 165, 245, 0.2)',
                    transition: 'transform 0.2s',
                    '&:hover': { transform: 'translateY(-4px)' }
                  }}>
                    <CardContent sx={{ p: 3 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box>
                          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 1 }}>
                            Verified Users
                          </Typography>
                          <Typography variant="h3" fontWeight="700" sx={{ color: 'white' }}>
                            {pagination.total}
                          </Typography>
                        </Box>
                        <Avatar sx={{ width: 56, height: 56, bgcolor: 'rgba(76, 175, 80, 0.2)' }}>
                          <VerifiedIcon sx={{ fontSize: 32, color: 'success.light' }} />
                        </Avatar>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{ 
                    background: 'linear-gradient(135deg, #5f3a1e 0%, #8c5a2d 100%)',
                    border: '1px solid rgba(255, 167, 38, 0.2)',
                    transition: 'transform 0.2s',
                    '&:hover': { transform: 'translateY(-4px)' }
                  }}>
                    <CardContent sx={{ p: 3 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box>
                          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 1 }}>
                            Unverified Users
                          </Typography>
                          <Typography variant="h3" fontWeight="700" sx={{ color: 'white' }}>
                            {unverifiedPagination.total}
                          </Typography>
                        </Box>
                        <Avatar sx={{ width: 56, height: 56, bgcolor: 'rgba(255, 152, 0, 0.2)' }}>
                          <WarningIcon sx={{ fontSize: 32, color: 'warning.light' }} />
                        </Avatar>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{ 
                    background: 'linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    transition: 'transform 0.2s',
                    '&:hover': { transform: 'translateY(-4px)' }
                  }}>
                    <CardContent sx={{ p: 3 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box>
                          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 1 }}>
                            Total Users
                          </Typography>
                          <Typography variant="h3" fontWeight="700" sx={{ color: 'white' }}>
                            {pagination.total + unverifiedPagination.total}
                          </Typography>
                        </Box>
                        <Avatar sx={{ width: 56, height: 56, bgcolor: 'rgba(33, 150, 243, 0.2)' }}>
                          <PersonIcon sx={{ fontSize: 32, color: 'primary.light' }} />
                        </Avatar>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{ 
                    background: loadingUsers 
                      ? 'linear-gradient(135deg, #1e3a5f 0%, #2d5a8c 100%)'
                      : searchQuery 
                        ? 'linear-gradient(135deg, #1e5f3a 0%, #2d8c5a 100%)'
                        : 'linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    transition: 'all 0.3s',
                    '&:hover': { transform: 'translateY(-4px)' }
                  }}>
                    <CardContent sx={{ p: 3 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 1 }}>
                            {loadingUsers ? 'Loading...' : searchQuery ? 'Active Search' : 'Status'}
                          </Typography>
                          <Typography 
                            variant="body1" 
                            fontWeight="600" 
                            sx={{ 
                              color: 'white',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {loadingUsers ? 'Please wait' : searchQuery ? `"${searchQuery}"` : 'Ready'}
                          </Typography>
                        </Box>
                        <Avatar sx={{ 
                          width: 56, 
                          height: 56, 
                          bgcolor: loadingUsers ? 'rgba(33, 150, 243, 0.2)' : searchQuery ? 'rgba(76, 175, 80, 0.2)' : 'rgba(158, 158, 158, 0.2)'
                        }}>
                          {loadingUsers ? (
                            <Box sx={{ 
                              width: 32, 
                              height: 32, 
                              border: '3px solid rgba(255,255,255,0.3)',
                              borderTopColor: 'white',
                              borderRadius: '50%',
                              animation: 'spin 1s linear infinite',
                              '@keyframes spin': {
                                '0%': { transform: 'rotate(0deg)' },
                                '100%': { transform: 'rotate(360deg)' }
                              }
                            }} />
                          ) : searchQuery ? (
                            <SearchIcon sx={{ fontSize: 32, color: 'success.light' }} />
                          ) : (
                            <CheckIcon sx={{ fontSize: 32, color: 'grey.500' }} />
                          )}
                        </Avatar>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* Search Bar */}
              <Paper 
                elevation={0}
                sx={{ 
                  p: 2.5,
                  mb: 4, 
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 3,
                  backdropFilter: 'blur(10px)'
                }}
              >
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                  <TextField
                    placeholder="Search users by name or email..."
                    value={searchInput}
                    onChange={handleSearchInputChange}
                    onKeyPress={handleSearchKeyPress}
                    size="medium"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon sx={{ color: 'primary.main' }} />
                        </InputAdornment>
                      ),
                      sx: {
                        height: '44px !important'
                      }
                    }}
                    sx={{
                      flex: 1,
                      minWidth: '250px',
                      '& .MuiOutlinedInput-root': {
                        color: 'grey.100',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: 2,
                        height: '44px !important',
                        '& fieldset': {
                          borderColor: 'rgba(255, 255, 255, 0.1)',
                        },
                        '&:hover fieldset': {
                          borderColor: 'rgba(255, 255, 255, 0.2)',
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: 'primary.main',
                          borderWidth: '2px'
                        },
                      },
                    }}
                  />
                  
                  {/* Online Status Filter */}
                  <FormControl size="medium" sx={{ minWidth: 150 }}>
                    <Select
                      value={onlineFilter}
                      onChange={(e) => {
                        setOnlineFilter(e.target.value);
                        setPagination(prev => ({ ...prev, page: 1 }));
                        setUnverifiedPagination(prev => ({ ...prev, page: 1 }));
                      }}
                      displayEmpty
                      sx={{
                        color: 'grey.100',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: 2,
                        height: '44px !important',
                        '& .MuiOutlinedInput-notchedOutline': {
                          borderColor: 'rgba(255, 255, 255, 0.1)',
                        },
                        '&:hover .MuiOutlinedInput-notchedOutline': {
                          borderColor: 'rgba(255, 255, 255, 0.2)',
                        },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                          borderColor: 'primary.main',
                          borderWidth: '2px'
                        },
                        '& .MuiSvgIcon-root': {
                          color: 'grey.400',
                        }
                      }}
                    >
                      <MenuItem value="">All Status</MenuItem>
                      <MenuItem value="online">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main' }} />
                          Online
                        </Box>
                      </MenuItem>
                      <MenuItem value="offline">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'grey.500' }} />
                          Offline
                        </Box>
                      </MenuItem>
                    </Select>
                  </FormControl>

                  {/* Sort By Filter */}
                  <FormControl size="medium" sx={{ minWidth: 180 }}>
                    <Select
                      value={sortBy}
                      onChange={(e) => {
                        setSortBy(e.target.value);
                        setPagination(prev => ({ ...prev, page: 1 }));
                        setUnverifiedPagination(prev => ({ ...prev, page: 1 }));
                      }}
                      sx={{
                        color: 'grey.100',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: 2,
                        height: '44px !important',
                        '& .MuiOutlinedInput-notchedOutline': {
                          borderColor: 'rgba(255, 255, 255, 0.1)',
                        },
                        '&:hover .MuiOutlinedInput-notchedOutline': {
                          borderColor: 'rgba(255, 255, 255, 0.2)',
                        },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                          borderColor: 'primary.main',
                          borderWidth: '2px'
                        },
                        '& .MuiSvgIcon-root': {
                          color: 'grey.400',
                        }
                      }}
                    >
                      <MenuItem value="createdAt">Sort by: Join Date</MenuItem>
                      <MenuItem value="lastOnline">Sort by: Last Online</MenuItem>
                    </Select>
                  </FormControl>

                  <Button
                    variant="contained"
                    onClick={handleSearchClick}
                    disabled={loadingUsers}
                    startIcon={<SearchIcon />}
                    sx={{
                      px: '24px !important',
                      py: '10px !important',
                      height: '44px !important',
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 600,
                      fontSize: '0.95rem',
                      color: 'white !important',
                      background: 'linear-gradient(45deg, #1976d2, #42a5f5)',
                      boxShadow: '0 4px 12px rgba(33, 150, 243, 0.3)',
                      '&:hover': {
                        background: 'linear-gradient(45deg, #1565c0, #1e88e5)',
                        boxShadow: '0 6px 16px rgba(33, 150, 243, 0.4)',
                      },
                      '&:disabled': {
                        background: 'grey.800',
                        boxShadow: 'none'
                      }
                    }}
                  >
                    Search
                  </Button>
                  {(searchInput || searchQuery || onlineFilter || sortBy !== 'createdAt') && (
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setSearchInput("");
                        setSearchQuery("");
                        setOnlineFilter("");
                        setSortBy("createdAt");
                        setPagination(prev => ({ ...prev, page: 1 }));
                        setUnverifiedPagination(prev => ({ ...prev, page: 1 }));
                      }}
                      disabled={loadingUsers}
                      startIcon={<CloseIcon />}
                      sx={{
                        px: '24px !important',
                        py: '10px !important',
                        height: '44px !important',
                        borderRadius: 2,
                        textTransform: 'none',
                        fontWeight: 600,
                        fontSize: '0.95rem',
                        color: 'white !important',
                        borderColor: 'rgba(255, 255, 255, 0.2) !important',
                        '&:hover': {
                          borderColor: 'rgba(255, 255, 255, 0.4) !important',
                          backgroundColor: 'rgba(255, 255, 255, 0.05) !important'
                        }
                      }}
                    >
                      Clear All
                    </Button>
                  )}
                </Box>
              </Paper>

              {/* Verified Users Section */}
              <Box sx={{ mb: 6 }}>
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: { xs: 'flex-start', md: 'center' }, 
                  mb: 4, 
                  justifyContent: "space-between",
                  flexWrap: 'wrap',
                  gap: 2,
                  pb: 3,
                  borderBottom: '2px solid rgba(76, 175, 80, 0.3)'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ 
                      width: 48, 
                      height: 48, 
                      bgcolor: 'rgba(76, 175, 80, 0.15)',
                      border: '2px solid rgba(76, 175, 80, 0.3)'
                    }}>
                      <VerifiedIcon sx={{ fontSize: 28, color: 'success.main' }} />
                    </Avatar>
                    <Box>
                      <Typography variant="h5" fontWeight="700" sx={{ color: 'grey.100', mb: 0.5 }}>
                        Verified Users
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'grey.400' }}>
                        {pagination.total} user{pagination.total !== 1 ? 's' : ''} with verified email
                      </Typography>
                    </Box>
                  </Box>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                  {
                    canAssignUsers ? <Button
                        variant="contained"
                        startIcon={<AssignmentIcon />}
                        style={{ color: "white", background: "linear-gradient(45deg, #1976d2, #42a5f5)", paddingInline: "12px" }}
                        onClick={openAssignModal}
                        sx={{
                          borderRadius: 3,
                          textTransform: 'none',
                          fontWeight: '600',
                          py: 1,
                          minHeight: '40px',
                          background: 'linear-gradient(45deg, #1976d2, #42a5f5)',
                          boxShadow: '0 4px 15px rgba(25, 118, 210, 0.3)',
                          '&:hover': {
                            background: 'linear-gradient(45deg, #1565c0, #1e88e5)'
                          }
                        }}
                      >
                      Assign User to Subadmins
                    </Button> : ""

                  }
                  </Stack>
                </Box>

                {(canAssignUsers || isSuperAdmin) && (
                  <div className={exportStyles.crmExportToolbar}>
                    <div className={exportStyles.crmExportToolbarInner}>
                      <div className={exportStyles.crmExportInfo}>
                        <p className={exportStyles.crmExportTitle}>
                          {canAssignUsers && isSuperAdmin
                            ? "Assign or export selected users"
                            : canAssignUsers
                              ? "Assign selected users"
                              : "Export to CRM"}
                        </p>
                        <p className={exportStyles.crmExportSubtitle}>
                          {selectedUserIds.size} user{selectedUserIds.size === 1 ? '' : 's'} selected
                        </p>
                      </div>
                      <div className={exportStyles.crmExportActions}>
                        <CrmOutlineButton
                          icon={<SelectAllIcon />}
                          onClick={handleSelectAllVisibleUsers}
                        >
                          Select Visible
                        </CrmOutlineButton>
                        <CrmOutlineButton
                          icon={<DeselectIcon />}
                          onClick={handleClearUserSelection}
                          disabled={selectedUserIds.size === 0}
                          variant="neutral"
                        >
                          Clear
                        </CrmOutlineButton>
                        {canAssignUsers && (
                          <button
                            type="button"
                            className={`${exportStyles.crmBtnBase} ${exportStyles.crmBtnAssign}`}
                            onClick={openAssignModalForSelected}
                            disabled={selectedUserIds.size === 0 || isAssigning}
                            title="Assign selected users to one or more subadmins"
                          >
                            <span className={exportStyles.crmBtnIcon}><PersonAddIcon /></span>
                            Assign to Subadmins ({selectedUserIds.size})
                          </button>
                        )}
                        {isSuperAdmin && (
                          <CrmExportButton
                            icon={<UploadIcon />}
                            onClick={() => setExportConfirmOpen(true)}
                            disabled={selectedUserIds.size === 0 || exportingToCrm}
                            loading={exportingToCrm}
                            title="Create CRM leads from selected wallet users"
                          >
                            Export to CRM ({selectedUserIds.size})
                          </CrmExportButton>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {!isSubadmin && pagination.total > 0 && (
                  <UsersPager
                    page={pagination.page}
                    limit={pagination.limit}
                    total={pagination.total}
                    pages={pagination.pages}
                    onChange={handleVerifiedPageChange}
                    tone="verified"
                    placement="top"
                  />
                )}

                {loadingUsers ? (
                  <Box sx={{ width: '100%', p: 4 }}>
                    <AdminSkeleton variant="cards" rows={3} />
                  </Box>
                ) : (
                  <>
                    <Grid container spacing={3}>
                      {Users.length > 0 ? (
                        Users.map((user) => (
                          <Grid item xs={12} sm={6} md={4} key={user._id}>
                            <UserCard
                              user={user}
                              onDelete={onOpenModal}
                              onVerify={bypassSingleUser}
                              onRestrict={onOpenRestrictModal}
                              onUpdateShared={updateUserIsShared}
                              canViewClientDetails={isSubadmin ? subadminClientPermissions.canViewClientDetails : true}
                              canEditClientProfile={isSubadmin ? subadminClientPermissions.canEditClientProfile : true}
                              isSubadminViewer={isSubadmin}
                              userTicketsCount={userTicketsCount}
                              subadmins={subadmins}
                              disabledIn={disabledIn}
                              isUsers={isUsers}
                              isRestricting={isRestricting}
                              authUser={currentAuthUser.user}
                              selectable={canAssignUsers || isSuperAdmin}
                              selected={selectedUserIds.has(user._id)}
                              onToggleSelect={toggleUserSelection}
                              showCrmExport={isSuperAdmin}
                              onExportToCrm={handleExportSingleUserToCrm}
                              isExportingToCrm={exportingUserId === user._id}
                              crmExportBusy={exportingToCrm}
                              canAssign={canAssignUsers}
                              onAssign={openAssignModalForUser}
                              onUnassignFromSubadmin={requestUnassignFromSubadmin}
                              unassigningKey={unassigningKey}
                            />
                          </Grid>
                        ))
                      ) : (
                        <Grid item xs={12}>
                          <Box sx={{ textAlign: 'center', py: 8 }}>
                            <PersonIcon sx={{ fontSize: 64, color: 'grey.600', mb: 2 }} />
                            <Typography variant="h6" sx={{ color: 'grey.400' }}>
                              No verified users found
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'grey.500', mt: 1 }}>
                              {searchQuery ? 'Try adjusting your search query' : 'No users to display'}
                            </Typography>
                          </Box>
                        </Grid>
                      )}
                    </Grid>

                    {!isSubadmin && pagination.total > 0 && (
                      <UsersPager
                        page={pagination.page}
                        limit={pagination.limit}
                        total={pagination.total}
                        pages={pagination.pages}
                        onChange={handleVerifiedPageChange}
                        tone="verified"
                        placement="bottom"
                      />
                    )}
                  </>
                )}
              </Box>

              {/* Unverified Users Section */}
              {(unVerified.length > 0 || unverifiedPagination.total > 0) && (
                <Box>
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    mb: 4,
                    pb: 3,
                    borderBottom: '2px solid rgba(255, 152, 0, 0.3)'
                  }}>
                    <Avatar sx={{ 
                      width: 48, 
                      height: 48, 
                      bgcolor: 'rgba(255, 152, 0, 0.15)',
                      border: '2px solid rgba(255, 152, 0, 0.3)',
                      mr: 2
                    }}>
                      <WarningIcon sx={{ fontSize: 28, color: 'warning.main' }} />
                    </Avatar>
                    <Box>
                      <Typography variant="h5" fontWeight="700" sx={{ color: 'grey.100', mb: 0.5 }}>
                        Unverified Users
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'grey.400' }}>
                        {unverifiedPagination.total} user{unverifiedPagination.total !== 1 ? 's' : ''} pending email verification
                      </Typography>
                    </Box>
                  </Box>

                  {!isSubadmin && unverifiedPagination.total > 0 && (
                    <UsersPager
                      page={unverifiedPagination.page}
                      limit={unverifiedPagination.limit}
                      total={unverifiedPagination.total}
                      pages={unverifiedPagination.pages}
                      onChange={handleUnverifiedPageChange}
                      tone="unverified"
                      placement="top"
                    />
                  )}

                  {loadingUsers ? (
                    <Box sx={{ width: '100%', p: 4 }}>
                      <AdminSkeleton variant="cards" rows={3} />
                    </Box>
                  ) : (
                    <>
                      <Grid container spacing={3}>
                        {unVerified.length > 0 ? (
                          unVerified.map((user) => (
                            <Grid item xs={12} sm={6} md={4} key={user._id}>
                              <UserCard
                                user={user}
                                isUnverified={true}
                                onDelete={onOpenModal}
                                onVerify={bypassSingleUser}
                                onRestrict={onOpenRestrictModal}
                                onUpdateShared={updateUserIsShared}
                                canViewClientDetails={isSubadmin ? subadminClientPermissions.canViewClientDetails : true}
                              canEditClientProfile={isSubadmin ? subadminClientPermissions.canEditClientProfile : true}
                              isSubadminViewer={isSubadmin}
                                userTicketsCount={userTicketsCount}
                                subadmins={subadmins}
                                disabledIn={disabledIn}
                                isUsers={isUsers}
                                isRestricting={isRestricting}
                                authUser={currentAuthUser.user}
                                selectable={canAssignUsers || isSuperAdmin}
                                selected={selectedUserIds.has(user._id)}
                                onToggleSelect={toggleUserSelection}
                                showCrmExport={isSuperAdmin}
                                onExportToCrm={handleExportSingleUserToCrm}
                                isExportingToCrm={exportingUserId === user._id}
                                crmExportBusy={exportingToCrm}
                                canAssign={canAssignUsers}
                                onAssign={openAssignModalForUser}
                                onUnassignFromSubadmin={requestUnassignFromSubadmin}
                                unassigningKey={unassigningKey}
                              />
                            </Grid>
                          ))
                        ) : (
                          <Grid item xs={12}>
                            <Box sx={{ textAlign: 'center', py: 8 }}>
                              <WarningIcon sx={{ fontSize: 64, color: 'grey.600', mb: 2 }} />
                              <Typography variant="h6" sx={{ color: 'grey.400' }}>
                                No unverified users found
                              </Typography>
                              <Typography variant="body2" sx={{ color: 'grey.500', mt: 1 }}>
                                {searchQuery ? 'Try adjusting your search query' : 'All users are verified'}
                              </Typography>
                            </Box>
                          </Grid>
                        )}
                      </Grid>

                      {!isSubadmin && unverifiedPagination.total > 0 && (
                        <UsersPager
                          page={unverifiedPagination.page}
                          limit={unverifiedPagination.limit}
                          total={unverifiedPagination.total}
                          pages={unverifiedPagination.pages}
                          onChange={handleUnverifiedPageChange}
                          tone="unverified"
                          placement="bottom"
                        />
                      )}
                    </>
                  )}
                </Box>
              )}
            </Box>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal - Dark Theme */}
      <Modal open={open} onClose={onCloseModal} center styles={{ modal: { backgroundColor: '#1e1e1e', border: '1px solid #333' } }}>
        <Box sx={{ p: 4, maxWidth: 400, textAlign: 'center' }}>
          <WarningIcon sx={{ fontSize: 64, mb: 2, color: 'error.main' }} />
          <Typography variant="h5" fontWeight="700" gutterBottom sx={{ color: 'grey.100' }}>
            Confirm Deletion
          </Typography>
          <Typography variant="body1" sx={{ mb: 3, color: 'grey.400' }}>
            Are you sure you want to delete <strong style={{ color: 'grey.100' }}>{modalData.firstName} {modalData.lastName}</strong>? This action cannot be undone.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button
              variant="outlined"
              onClick={onCloseModal}
              sx={{
                borderRadius: 2,
                px: 4,
                color: 'grey.300',
                borderColor: 'grey.600',
                '&:hover': {
                  borderColor: 'grey.400'
                }
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              sx={{ borderRadius: 2, px: 4 }}
              onClick={() => deleteEachUser(modalData)}
              disabled={isDisable}
            >
              {isDisable ? 'Deleting...' : 'Delete'}
            </Button>
          </Box>
        </Box>
      </Modal>

      {/* Compliance Restriction Modal */}
      <Modal
        open={restrictModalOpen}
        onClose={onCloseRestrictModal}
        center
        styles={{ modal: { backgroundColor: '#1e1e1e', border: '1px solid #333', maxWidth: '480px' } }}
      >
        <Box sx={{ p: 4, textAlign: 'center' }}>
          {restrictModalData.isComplianceRestricted ? (
            <LockOpenIcon sx={{ fontSize: 64, mb: 2, color: 'success.main' }} />
          ) : (
            <GavelIcon sx={{ fontSize: 64, mb: 2, color: '#ef5350' }} />
          )}
          <Typography variant="h5" fontWeight="700" gutterBottom sx={{ color: 'grey.100' }}>
            {restrictModalData.isComplianceRestricted ? 'Remove Compliance Restriction' : 'Restrict User Account'}
          </Typography>
          <Typography variant="body1" sx={{ mb: 2, color: 'grey.400', textAlign: 'left' }}>
            {restrictModalData.isComplianceRestricted ? (
              <>
                Remove the compliance review status for{' '}
                <strong style={{ color: 'grey.100' }}>
                  {restrictModalData.firstName} {restrictModalData.lastName}
                </strong>
                . The red account review banner will no longer appear on their dashboard.
              </>
            ) : (
              <>
                Place{' '}
                <strong style={{ color: 'grey.100' }}>
                  {restrictModalData.firstName} {restrictModalData.lastName}
                </strong>{' '}
                under compliance review. They will see a prominent red banner on every dashboard page with instructions to contact support.
              </>
            )}
          </Typography>
          {!restrictModalData.isComplianceRestricted && (
            <Box
              sx={{
                mb: 3,
                p: 2,
                borderRadius: 2,
                bgcolor: 'rgba(139, 0, 0, 0.15)',
                border: '1px solid rgba(239, 83, 80, 0.35)',
                textAlign: 'left',
              }}
            >
              <Typography variant="caption" sx={{ color: '#ef9a9a', lineHeight: 1.6, display: 'block' }}>
                Banner message: account under review due to potential money laundering concerns, with a link to customer support.
              </Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button
              variant="outlined"
              onClick={onCloseRestrictModal}
              sx={{
                borderRadius: 2,
                px: 4,
                color: 'grey.300',
                borderColor: 'grey.600',
                '&:hover': { borderColor: 'grey.400' },
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color={restrictModalData.isComplianceRestricted ? 'success' : 'error'}
              sx={{
                borderRadius: 2,
                px: 4,
                ...(restrictModalData.isComplianceRestricted
                  ? {}
                  : { backgroundColor: '#8b0000', '&:hover': { backgroundColor: '#b71c1c' } }),
              }}
              onClick={() => handleComplianceRestriction(restrictModalData)}
              disabled={isRestricting}
            >
              {isRestricting
                ? 'Updating...'
                : restrictModalData.isComplianceRestricted
                  ? 'Remove Restriction'
                  : 'Restrict Account'}
            </Button>
          </Box>
        </Box>
      </Modal>

      {/* Assign User to Subadmin Modal */}
      <Dialog
        open={assignModalOpen}
        onClose={closeAssignModal}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          className: "hui-assign-dialog",
          sx: {
            backgroundColor: '#1e1e1e',
            backgroundImage: 'none',
            border: '1px solid #333',
            borderRadius: 3,
            overflow: 'hidden',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
          }
        }}
      >
        <DialogTitle sx={{
          bgcolor: 'grey.900',
          borderBottom: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <Typography variant="h6" fontWeight="600" sx={{ color: 'grey.100' }}>
            {assignTarget.type === "bulk"
              ? `Assign ${assignTarget.count} Users to Subadmins`
              : assignTarget.type === "user"
                ? "Assign User to Subadmins"
                : "Assign User to Subadmins"}
          </Typography>
          <IconButton onClick={closeAssignModal} sx={{ color: 'grey.400' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent
          sx={{
            p: 3,
            bgcolor: '#1e1e1e',
            overflow: subadminPickerOpen ? 'hidden' : 'auto',
            flex: '1 1 auto',
            minHeight: 0,
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {assignTarget.type === "bulk" ? (
              <Box sx={{ p: 2, bgcolor: 'grey.800', borderRadius: 2, mt: 1 }}>
                <Typography variant="subtitle2" fontWeight="600" sx={{ color: 'grey.100' }}>
                  {assignTarget.count} selected user{assignTarget.count === 1 ? "" : "s"}
                </Typography>
                <Typography variant="body2" sx={{ color: 'grey.400', mt: 0.5 }}>
                  Each selected user will be added to the subadmins you pick below.
                </Typography>
              </Box>
            ) : (
              <Box>
                <TextField
                  fullWidth
                  label="User Email"
                  value={assignEmail}
                  onChange={(e) => setAssignEmail(e.target.value)}
                  error={!!emailError}
                  helperText={emailError || (assignTarget.type === "user" ? assignTarget.name : "")}
                  InputProps={{
                    readOnly: assignTarget.type === "user",
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      color: 'grey.100',
                      '& fieldset': {
                        borderColor: 'grey.600',
                      },
                      '&:hover fieldset': {
                        borderColor: 'grey.400',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: 'primary.main',
                      },
                    },
                    '& .MuiInputLabel-root': {
                      color: 'grey.400',
                      backgroundColor: '#1e1e1e',
                      paddingX: '4px',
                    },
                    '& .MuiInputLabel-root.Mui-focused': {
                      color: 'primary.main',
                    },
                    '& .MuiInputLabel-shrink': {
                      backgroundColor: '#1e1e1e',
                    },
                  }}
                />
              </Box>
            )}

            <div>
              <span className="hui-picker-label">Select subadmins</span>
              <div className={`hui-picker${subadminPickerOpen ? " is-open" : ""}`}>
                <div className="hui-picker-selected">
                  {selectedSubadmins.length === 0 ? (
                    <span className="hui-picker-empty">None selected yet</span>
                  ) : selectedSubadmins.map((id) => {
                    const subadmin = filteredSubadmins.find((s) => s._id === id);
                    const label = subadmin ? `${subadmin.firstName} ${subadmin.lastName}` : id;
                    return (
                      <span className="hui-picker-chip" key={id}>
                        {label}
                        <button
                          type="button"
                          aria-label={`Remove ${label}`}
                          onClick={() => toggleSelectedSubadmin(id)}
                        >
                          <CloseIcon sx={{ fontSize: 12 }} />
                        </button>
                      </span>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="hui-picker-trigger"
                  aria-expanded={subadminPickerOpen}
                  aria-haspopup="listbox"
                  onClick={() => setSubadminPickerOpen((open) => !open)}
                >
                  <span className="hui-picker-trigger-value">
                    {selectedSubadmins.length === 0
                      ? "Choose subadmins"
                      : `${selectedSubadmins.length} selected`}
                  </span>
                  <KeyboardArrowDownIcon className="hui-picker-caret" sx={{ fontSize: 22 }} />
                </button>
                {subadminPickerOpen && (
                  <div className="hui-picker-list" role="listbox" aria-multiselectable="true">
                    {filteredSubadmins.length === 0 ? (
                      <p className="hui-picker-empty-list">No subadmins available</p>
                    ) : filteredSubadmins.map((subadmin) => {
                      const selected = selectedSubadmins.includes(subadmin._id);
                      const initials = `${(subadmin.firstName || "S")[0] || ""}${(subadmin.lastName || "A")[0] || ""}`.toUpperCase();
                      return (
                        <button
                          type="button"
                          key={subadmin._id}
                          role="option"
                          aria-selected={selected}
                          className={`hui-picker-row${selected ? " is-selected" : ""}`}
                          onClick={() => toggleSelectedSubadmin(subadmin._id)}
                        >
                          <span className="hui-picker-check">
                            {selected ? <SelectCheckIcon sx={{ fontSize: 14 }} /> : null}
                          </span>
                          <span className="hui-picker-avatar">{initials}</span>
                          <span className="hui-picker-meta">
                            <span className="hui-picker-name">{subadmin.firstName} {subadmin.lastName}</span>
                            <span className="hui-picker-email">{subadmin.email}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {subadminError && (
                  <p className="hui-picker-error">{subadminError}</p>
                )}
              </div>
            </div>

            {/* Info Text */}
            <Box sx={{ p: 1.5, bgcolor: 'grey.800', borderRadius: 2 }}>
              <Typography variant="body2" sx={{ color: 'grey.300' }}>
                <strong>Note:</strong>{" "}
                {assignTarget.type === "bulk"
                  ? "Selected users will be assigned to the subadmins you choose. Existing assignments are kept."
                  : assignTarget.type === "user"
                    ? "This user will be added to the selected subadmins without removing existing assignments."
                    : "Enter the email of the user you want to assign, then select one or more subadmins. Assigning adds those subadmins without removing existing ones."}
              </Typography>
            </Box>
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 3, bgcolor: 'grey.900', borderTop: '1px solid #333', flexShrink: 0 }}>
          <Button
            onClick={closeAssignModal}
            sx={{
              color: 'grey.300',
              borderColor: 'grey.600',
              '&:hover': {
                borderColor: 'grey.400'
              }
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAssignUser}
            disabled={isAssigning}
            startIcon={isAssigning ? null : <AssignmentIcon />}
            sx={{
              background: 'linear-gradient(45deg, #1976d2, #42a5f5)',
              '&:hover': {
                background: 'linear-gradient(45deg, #1565c0, #1e88e5)'
              },
              '&:disabled': {
                background: 'grey.600'
              }
            }}
          >
            {isAssigning
              ? 'Assigning...'
              : assignTarget.type === "bulk"
                ? `Assign ${assignTarget.count} Users`
                : 'Assign User'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(unassignConfirm)}
        onClose={closeUnassignConfirm}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: '#1e1e1e',
            backgroundImage: 'none',
            border: '1px solid #333',
            borderRadius: 3
          }
        }}
      >
        <DialogTitle sx={{ bgcolor: 'grey.900', color: 'grey.100', fontWeight: 700 }}>
          Unassign User
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#1e1e1e' }}>
          <Typography variant="body1" sx={{ color: 'grey.300', mt: 1 }}>
            Remove{" "}
            <strong style={{ color: '#fff' }}>
              {unassignConfirm?.user?.firstName} {unassignConfirm?.user?.lastName}
            </strong>
            {" "}from{" "}
            <strong style={{ color: '#fff' }}>{unassignConfirm?.name}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: 'grey.900' }}>
          <Button onClick={closeUnassignConfirm} disabled={Boolean(unassigningKey)} sx={{ color: 'grey.300' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={confirmUnassignFromSubadmin}
            disabled={Boolean(unassigningKey)}
          >
            {unassigningKey ? 'Unassigning...' : 'Unassign'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={exportConfirmOpen}
        onClose={() => !exportingToCrm && setExportConfirmOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Export Users to CRM Leads
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Import <strong>{selectedUserIds.size}</strong> wallet user{selectedUserIds.size === 1 ? '' : 's'} into the CRM leads database?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Name, email, phone, country, and address will be copied. Users with an existing lead email or phone will be skipped.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setExportConfirmOpen(false)} disabled={exportingToCrm}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleExportUsersToCrm}
            disabled={exportingToCrm}
            startIcon={exportingToCrm ? <CircularProgress size={16} color="inherit" /> : <UploadIcon />}
          >
            {exportingToCrm ? 'Exporting...' : 'Export to CRM'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
    </AdminShell>
  );
};

export default React.memo(AdminUsers);