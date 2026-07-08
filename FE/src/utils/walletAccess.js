/**
 * Wallet Access Utility Functions
 * 
 * Provides helper functions to check wallet access permissions
 * based on user role, individual permissions, and global settings.
 */

/**
 * Check if a user has wallet access
 * @param {Object} user - User object with role and permissions
 * @param {Object} globalSettings - Global settings object with walletEnabled
 * @returns {boolean} - True if user has wallet access, false otherwise
 */
export function hasWalletAccess(user, globalSettings) {
  if (!user) {
    return false;
  }

  // Super Admin always has access - check this FIRST before any other checks
  if (user.role === 'superadmin') {
    return true;
  }

  // Global setting overrides everything (superadmin already handled above)
  if (!globalSettings?.walletEnabled) {
    return false;
  }

  // Admin: Check adminPermissions.accessWallet
  // Must be explicitly true (undefined or false = no access) - matches backend logic
  if (user.role === 'admin') {
    const accessWallet = user.adminPermissions?.accessWallet;
    return accessWallet === true; // Only true if explicitly set to true
  }

  // Sub Admin: Check permissions.accessWallet
  // Must be explicitly true (undefined or false = no access) - matches backend logic
  if (user.role === 'subadmin') {
    const accessWallet = user.permissions?.accessWallet;
    return accessWallet === true; // Only true if explicitly set to true
  }

  // Regular users are not gated by per-user wallet permissions
  if (user.role === 'user') {
    return true;
  }

  return false;
}

/**
 * Get detailed wallet access status
 * @param {Object} user - User object with role and permissions
 * @param {Object} globalSettings - Global settings object with walletEnabled
 * @returns {Object} - Detailed access status object
 */
export function getWalletAccessStatus(user, globalSettings) {
  const status = {
    hasAccess: false,
    reason: '',
    canOverride: false
  };

  if (!user) {
    status.reason = 'User not authenticated';
    return status;
  }

  // Check global setting first
  if (!globalSettings?.walletEnabled) {
    if (user.role === 'superadmin') {
      status.hasAccess = true;
      status.canOverride = true;
      status.reason = 'Superadmin can access even when globally disabled';
      return status;
    }
    status.reason = 'Wallet platform is globally disabled';
    return status;
  }

  // Super Admin always has access
  if (user.role === 'superadmin') {
    status.hasAccess = true;
    status.reason = 'Superadmin has full access';
    return status;
  }

  // Check role-specific permissions
  let hasPermission = false;
  if (user.role === 'admin') {
    hasPermission = user.adminPermissions?.accessWallet === true;
    status.reason = hasPermission 
      ? 'Admin has wallet access permission' 
      : 'Admin wallet access permission denied';
  } else if (user.role === 'subadmin') {
    hasPermission = user.permissions?.accessWallet === true;
    status.reason = hasPermission 
      ? 'Subadmin has wallet access permission' 
      : 'Subadmin wallet access permission denied';
  } else if (user.role === 'user') {
    hasPermission = true;
    status.reason = 'User has wallet access when platform is enabled';
  } else {
    status.reason = 'Unknown user role';
    return status;
  }

  status.hasAccess = hasPermission;
  return status;
}

/**
 * Resolve where admin/subadmin should go when wallet access is denied
 */
export function getWalletDeniedRedirectPath(user) {
  if (!user) return '/';

  const hasCrmAccess =
    (user.role === 'admin' && user.adminPermissions?.accessCrm === true) ||
    (user.role === 'subadmin' && user.permissions?.accessCrm === true);

  return hasCrmAccess ? '/admin/dashboard/crm' : '/';
}
