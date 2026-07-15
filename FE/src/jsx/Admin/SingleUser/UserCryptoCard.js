import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Spinner } from "react-bootstrap";
import SideBar from "../../layouts/AdminSidebar/Sidebar";
import UserSideBar from "./UserSideBar";
import AdminHeader from "../adminHeader";
import { signleUsersApi, userCryptoCardApi, userCryptoCardStatusApi } from "../../../Api/Service";
import { toast } from "react-toastify";
import UsdtLogo from "../../../assets/images/usdt.png";
import euroStyles from "./UserEuroAccount.module.css";
import styles from "./UserCryptoCard.module.css";
import "./style.css";

const EMPTY_FORM = {
  cardNumber: "",
  cardHolder: "",
  expiryDate: "",
  cvv: "",
};

const formatCardNumber = (value) => {
  if (!value) return "";
  return String(value).replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim();
};

const maskCardNumber = (number) => {
  if (!number) return "**** **** **** ****";
  const digits = String(number).replace(/\D/g, "");
  const lastFour = digits.slice(-4) || "****";
  return `**** **** **** ${lastFour}`;
};

const STATUS_CONFIG = {
  active: { label: "Active", className: styles.statusChipActive },
  applied: { label: "Applied — Pending Activation", className: styles.statusChipApplied },
  inactive: { label: "Inactive", className: styles.statusChipInactive },
  deactivated: { label: "Deactivated", className: styles.statusChipDeactivated },
};

const CardPreview = ({ form, cardStatus, isDimmed = false }) => (
  <div className={styles.cardPreviewWrap}>
    <div className={`${styles.cardPreview} ${isDimmed ? styles.cardPreviewInactive : ""}`}>
      <div className={styles.cardPreviewTop}>
        <img src={UsdtLogo} alt="USDT" className={styles.cardPreviewLogo} />
        <span className={styles.cardPreviewBadge}>VIRTUAL</span>
      </div>
      <div className={styles.cardPreviewNumber}>
        {form.cardNumber || "**** **** **** ****"}
      </div>
      <div className={styles.cardPreviewBottom}>
        <div className={styles.cardPreviewMeta}>
          <span className={styles.cardPreviewLabel}>Valid Thru</span>
          <span className={styles.cardPreviewValue}>{form.expiryDate || "**/**"}</span>
          <span className={styles.cardPreviewValue}>
            {(form.cardHolder || "CARDHOLDER").toUpperCase()}
          </span>
        </div>
        <span className={styles.cardPreviewVisa}>VISA</span>
      </div>
    </div>
    <p className={styles.previewCaption}>
      {cardStatus === "active"
        ? "Live preview — user sees this card on their dashboard"
        : cardStatus === "deactivated"
          ? "Card is saved but deactivated for this user"
          : "Preview updates as you enter card details"}
    </p>
  </div>
);

const UserCryptoCard = () => {
  const { id } = useParams();
  const [Active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [userData, setUserData] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  const toggleBar = () => setActive((prev) => !prev);

  const loadUser = useCallback(async () => {
    try {
      setLoading(true);
      const response = await signleUsersApi(id);
      if (response.success) {
        const user = response.signleUser;
        setUserData(user);
        const card = user.cryptoCard || {};
        setForm({
          cardNumber: card.cardNumber ? formatCardNumber(card.cardNumber) : "",
          cardHolder: card.cardName || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          expiryDate: card.Exp || "",
          cvv: card.cvv ? String(card.cvv) : "",
        });
        const status = card.status || "inactive";
        setIsEditing(status !== "active" && !(status === "inactive" && card.cardNumber));
      } else {
        toast.error(response.msg || "Failed to load user");
      }
    } catch (error) {
      toast.error("Failed to load user");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const handleChange = (field) => (event) => {
    let value = event.target.value;
    if (field === "cardNumber") value = formatCardNumber(value);
    if (field === "expiryDate") value = value.replace(/[^\d/]/g, "").slice(0, 5);
    if (field === "cvv") value = value.replace(/\D/g, "").slice(0, 4);
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const validate = () => {
    const nextErrors = {};
    const digits = form.cardNumber.replace(/\D/g, "");
    if (!digits) nextErrors.cardNumber = "Card number is required";
    else if (digits.length !== 16) nextErrors.cardNumber = "Card number must be 16 digits";
    if (!form.cardHolder.trim()) nextErrors.cardHolder = "Card holder name is required";
    if (!form.expiryDate.trim()) nextErrors.expiryDate = "Expiry date is required";
    if (!form.cvv.trim()) nextErrors.cvv = "CVV is required";
    else if (form.cvv.length < 3) nextErrors.cvv = "CVV must be 3–4 digits";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      const response = await userCryptoCardApi({
        userId: id,
        cardNumber: form.cardNumber.replace(/\D/g, ""),
        cardName: form.cardHolder.trim(),
        cardExpiry: form.expiryDate.trim(),
        cardCvv: form.cvv.trim(),
      });

      if (response.success) {
        toast.success(response.msg || "Crypto card saved successfully");
        await loadUser();
        setIsEditing(false);
      } else {
        toast.error(response.msg || "Failed to save crypto card");
      }
    } catch (error) {
      toast.error(error?.response?.data?.msg || error?.message || "Failed to save crypto card");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (action) => {
    const confirmMessage =
      action === "deactivate"
        ? "Deactivate this user's crypto card? They will no longer be able to view card details."
        : "Activate this user's crypto card with the saved details?";

    if (!window.confirm(confirmMessage)) return;

    try {
      setTogglingStatus(true);
      const response = await userCryptoCardStatusApi(id, action);
      if (response.success) {
        toast.success(response.msg || `Crypto card ${action}d`);
        await loadUser();
        setIsEditing(false);
      } else {
        toast.error(response.msg || `Failed to ${action} crypto card`);
      }
    } catch (error) {
      toast.error(error?.response?.data?.msg || error?.message || `Failed to ${action} crypto card`);
    } finally {
      setTogglingStatus(false);
    }
  };

  const startEdit = () => setIsEditing(true);

  const cancelEdit = () => {
    if (!userData) return;
    const card = userData.cryptoCard || {};
    setForm({
      cardNumber: card.cardNumber ? formatCardNumber(card.cardNumber) : "",
      cardHolder: card.cardName || `${userData.firstName || ""} ${userData.lastName || ""}`.trim(),
      expiryDate: card.Exp || "",
      cvv: card.cvv ? String(card.cvv) : "",
    });
    setErrors({});
    setIsEditing(false);
  };

  const cardStatus = userData?.cryptoCard?.status || "inactive";
  const hasCardDetails = Boolean(userData?.cryptoCard?.cardNumber);
  const isDeactivated = cardStatus === "inactive" && hasCardDetails;
  const displayStatus = isDeactivated ? "deactivated" : cardStatus;
  const statusConfig = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.inactive;
  const userName = userData
    ? `${userData.firstName || ""} ${userData.lastName || ""}`.trim() || userData.email
    : "";
  const hasActiveCard = cardStatus === "active";
  const showForm =
    isEditing || cardStatus === "applied" || (!hasActiveCard && !isDeactivated);
  const isBusy = saving || togglingStatus;

  const renderSavedCardView = ({ title, subtitle, bannerClass, bannerText, actions }) => (
    <>
      <div className={euroStyles.panelHeader}>
        <div>
          <h2 className={euroStyles.panelTitle}>{title}</h2>
          <p className={euroStyles.panelSubtitle}>{subtitle}</p>
        </div>
        <div className={euroStyles.actionsRow} style={{ marginTop: 0 }}>
          {actions}
        </div>
      </div>

      <div className={`${styles.alertBanner} ${bannerClass}`}>
        {bannerText}
      </div>

      <div className={styles.contentGrid}>
        <div className={euroStyles.detailsGrid}>
          <div className={euroStyles.detailItem}>
            <span className={euroStyles.detailLabel}>Card Number</span>
            <p className={euroStyles.detailValue}>
              {maskCardNumber(userData.cryptoCard?.cardNumber)}
            </p>
          </div>
          <div className={euroStyles.detailItem}>
            <span className={euroStyles.detailLabel}>Cardholder</span>
            <p className={euroStyles.detailValue}>
              {userData.cryptoCard?.cardName || "—"}
            </p>
          </div>
          <div className={euroStyles.detailItem}>
            <span className={euroStyles.detailLabel}>Expiry</span>
            <p className={euroStyles.detailValue}>
              {userData.cryptoCard?.Exp || "—"}
            </p>
          </div>
          <div className={euroStyles.detailItem}>
            <span className={euroStyles.detailLabel}>CVV</span>
            <p className={euroStyles.detailValue}>•••</p>
          </div>
        </div>

        <CardPreview
          form={{
            cardNumber: maskCardNumber(userData.cryptoCard?.cardNumber),
            cardHolder: userData.cryptoCard?.cardName || userName,
            expiryDate: userData.cryptoCard?.Exp || "**/**",
          }}
          cardStatus={displayStatus}
          isDimmed={isDeactivated}
        />
      </div>
    </>
  );

  return (
    <div className="admin">
      <div className="bg-muted-100 pb-20 dark:bg-muted-900">
        <SideBar state={Active} toggle={toggleBar} />
        <div className="relative min-h-screen w-full overflow-x-hidden bg-muted-100 px-4 transition-all duration-300 dark:bg-muted-900 xl:px-10 lg:max-w-[calc(100%_-_280px)] lg:ms-[280px]">
          <div className="mx-auto w-full max-w-7xl">
            <AdminHeader toggle={toggleBar} pageName="User Management" />

            <div className="min-h-screen overflow-hidden pt-2">
              <div className="grid gap-8 sm:grid-cols-12">
                <UserSideBar userid={id} />

                <div className={`col-span-12 sm:col-span-8 ${euroStyles.euroAccountPage} ${styles.cryptoPage}`}>
                  <div className="space-y-6">
                    <div className={styles.heroCard}>
                      <div className={styles.heroTop}>
                        <div>
                          <h1 className={styles.heroTitle}>Crypto Card</h1>
                          <p className={styles.heroSubtitle}>
                            Activate and manage the virtual USDT Visa card for{" "}
                            {userName || "this user"}. Once active, the user can view card details from their dashboard.
                          </p>
                        </div>
                        {!loading && (
                          <span className={`${styles.statusChip} ${statusConfig.className}`}>
                            {cardStatus === "active" && (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            )}
                            {cardStatus === "applied" && (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 6v6l4 2" />
                              </svg>
                            )}
                            {isDeactivated && (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M15 9l-6 6M9 9l6 6" />
                              </svg>
                            )}
                            {statusConfig.label}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={euroStyles.panel}>
                      {loading ? (
                        <div className={euroStyles.loadingWrap}>
                          <Spinner animation="border" variant="primary" />
                        </div>
                      ) : showForm ? (
                        <>
                          <div className={euroStyles.panelHeader}>
                            <div>
                              <h2 className={euroStyles.panelTitle}>
                                {hasActiveCard || isDeactivated ? "Edit Crypto Card" : "Activate Crypto Card"}
                              </h2>
                              <p className={euroStyles.panelSubtitle}>
                                {cardStatus === "applied"
                                  ? "This user submitted a card application. Enter the card details below to activate it."
                                  : "Enter the virtual card details. All fields are required."}
                              </p>
                            </div>
                          </div>

                          {cardStatus === "applied" && (
                            <div className={`${styles.alertBanner} ${styles.alertBannerWarning}`}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                              </svg>
                              <span>
                                Card application pending — fill in the details and click <strong>Activate Card</strong> to complete activation.
                              </span>
                            </div>
                          )}

                          <div className={styles.contentGrid}>
                            <form onSubmit={handleSubmit} noValidate>
                              <div className={euroStyles.formGrid}>
                                <div className={`${euroStyles.formField} ${euroStyles.formFieldFull}`}>
                                  <label className={euroStyles.formLabel} htmlFor="cardNumber">
                                    Card Number
                                  </label>
                                  <input
                                    id="cardNumber"
                                    type="text"
                                    className={`${euroStyles.formInput} ${errors.cardNumber ? styles.formInputError : ""}`}
                                    placeholder="4242 4242 4242 4242"
                                    value={form.cardNumber}
                                    onChange={handleChange("cardNumber")}
                                    maxLength={19}
                                    autoComplete="off"
                                  />
                                  {errors.cardNumber && (
                                    <p className={styles.formError}>{errors.cardNumber}</p>
                                  )}
                                </div>

                                <div className={`${euroStyles.formField} ${euroStyles.formFieldFull}`}>
                                  <label className={euroStyles.formLabel} htmlFor="cardHolder">
                                    Cardholder Name
                                  </label>
                                  <input
                                    id="cardHolder"
                                    type="text"
                                    className={`${euroStyles.formInput} ${errors.cardHolder ? styles.formInputError : ""}`}
                                    placeholder="Name as shown on card"
                                    value={form.cardHolder}
                                    onChange={handleChange("cardHolder")}
                                    autoComplete="off"
                                  />
                                  {errors.cardHolder && (
                                    <p className={styles.formError}>{errors.cardHolder}</p>
                                  )}
                                </div>

                                <div className={euroStyles.formField}>
                                  <label className={euroStyles.formLabel} htmlFor="expiryDate">
                                    Expiry Date
                                  </label>
                                  <input
                                    id="expiryDate"
                                    type="text"
                                    className={`${euroStyles.formInput} ${errors.expiryDate ? styles.formInputError : ""}`}
                                    placeholder="MM/YY"
                                    value={form.expiryDate}
                                    onChange={handleChange("expiryDate")}
                                    autoComplete="off"
                                  />
                                  {errors.expiryDate && (
                                    <p className={styles.formError}>{errors.expiryDate}</p>
                                  )}
                                </div>

                                <div className={euroStyles.formField}>
                                  <label className={euroStyles.formLabel} htmlFor="cvv">
                                    CVV
                                  </label>
                                  <input
                                    id="cvv"
                                    type="password"
                                    className={`${euroStyles.formInput} ${errors.cvv ? styles.formInputError : ""}`}
                                    placeholder="•••"
                                    value={form.cvv}
                                    onChange={handleChange("cvv")}
                                    maxLength={4}
                                    autoComplete="off"
                                  />
                                  {errors.cvv && (
                                    <p className={styles.formError}>{errors.cvv}</p>
                                  )}
                                </div>
                              </div>

                              <div className={euroStyles.actionsRow}>
                                <button
                                  type="submit"
                                  className={`${euroStyles.btnPrimary} euro-account-btn`}
                                  disabled={isBusy}
                                >
                                  {saving
                                    ? "Saving..."
                                    : hasActiveCard || isDeactivated
                                      ? "Save Changes"
                                      : "Activate Card"}
                                </button>
                                {(hasActiveCard || isDeactivated) && (
                                  <button
                                    type="button"
                                    className={`${euroStyles.btnSecondary} euro-account-btn`}
                                    onClick={cancelEdit}
                                    disabled={isBusy}
                                  >
                                    Cancel
                                  </button>
                                )}
                              </div>
                            </form>

                            <CardPreview
                              form={form}
                              cardStatus={displayStatus}
                              isDimmed={isDeactivated}
                            />
                          </div>
                        </>
                      ) : hasActiveCard ? (
                        renderSavedCardView({
                          title: "Active Crypto Card",
                          subtitle: "Card is live on the user's dashboard. You can edit details or deactivate it.",
                          bannerClass: styles.alertBannerSuccess,
                          bannerText: (
                            <>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                              <span>This user&apos;s crypto card is active and visible on their Crypto Card page.</span>
                            </>
                          ),
                          actions: (
                            <>
                              <button
                                type="button"
                                className={`${euroStyles.btnSecondary} euro-account-btn`}
                                onClick={startEdit}
                                disabled={isBusy}
                              >
                                Edit Card
                              </button>
                              <button
                                type="button"
                                className={`${euroStyles.btnDanger} euro-account-btn`}
                                onClick={() => handleToggleStatus("deactivate")}
                                disabled={isBusy}
                              >
                                {togglingStatus ? "Deactivating..." : "Deactivate Card"}
                              </button>
                            </>
                          ),
                        })
                      ) : (
                        renderSavedCardView({
                          title: "Deactivated Crypto Card",
                          subtitle: "Card details are saved but hidden from the user until you activate it again.",
                          bannerClass: styles.alertBannerDanger,
                          bannerText: (
                            <>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M15 9l-6 6M9 9l6 6" />
                              </svg>
                              <span>This card is deactivated. The user cannot view card details until you activate it.</span>
                            </>
                          ),
                          actions: (
                            <>
                              <button
                                type="button"
                                className={`${euroStyles.btnPrimary} euro-account-btn`}
                                onClick={() => handleToggleStatus("activate")}
                                disabled={isBusy}
                              >
                                {togglingStatus ? "Activating..." : "Activate Card"}
                              </button>
                              <button
                                type="button"
                                className={`${euroStyles.btnSecondary} euro-account-btn`}
                                onClick={startEdit}
                                disabled={isBusy}
                              >
                                Edit Card
                              </button>
                            </>
                          ),
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserCryptoCard;
