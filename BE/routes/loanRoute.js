const express = require("express");
const {
  getMyLoanApplication,
  saveMyLoanApplication,
  submitMyLoanApplication,
  uploadLoanDocument,
  getLoanApplicationByUser,
  getAllLoanApplications,
  updateLoanApplicationStatus,
  viewLoanDocument,
  deleteLoanApplication,
} = require("../controllers/loanController");
const { isAuthorizedUser, authorizedRoles } = require("../middlewares/auth");
const { requireLoanFeatureEnabled } = require("../middlewares/loanFeatureEnabled");
const singleUpload = require("../middlewares/multer");

const router = express.Router();

router
  .route("/loanApplication/my")
  .get(isAuthorizedUser, authorizedRoles("user"), requireLoanFeatureEnabled, getMyLoanApplication)
  .patch(isAuthorizedUser, authorizedRoles("user"), requireLoanFeatureEnabled, saveMyLoanApplication);

router
  .route("/loanApplication/submit")
  .post(isAuthorizedUser, authorizedRoles("user"), requireLoanFeatureEnabled, submitMyLoanApplication);

router
  .route("/loanApplication/upload")
  .post(isAuthorizedUser, authorizedRoles("user"), requireLoanFeatureEnabled, singleUpload, uploadLoanDocument);

router
  .route("/loanApplication/user/:userId")
  .get(
    isAuthorizedUser,
    authorizedRoles("superadmin", "admin", "subadmin"),
    getLoanApplicationByUser
  );

router
  .route("/loanDocument/:userId/:docSlot")
  .get(
    isAuthorizedUser,
    authorizedRoles("superadmin", "admin", "subadmin"),
    viewLoanDocument
  );

router
  .route("/loanApplications")
  .get(
    isAuthorizedUser,
    authorizedRoles("superadmin", "admin", "subadmin"),
    getAllLoanApplications
  );

router
  .route("/loanApplication/:id/status")
  .patch(
    isAuthorizedUser,
    authorizedRoles("superadmin", "admin", "subadmin"),
    updateLoanApplicationStatus
  );

router
  .route("/loanApplication/:id")
  .delete(
    isAuthorizedUser,
    authorizedRoles("superadmin", "admin", "subadmin"),
    deleteLoanApplication
  );

module.exports = router;
