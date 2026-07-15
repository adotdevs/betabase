import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Spinner } from "react-bootstrap";
import SideBar from "../../layouts/AdminSidebar/Sidebar";
import UserSideBar from "./UserSideBar";
import AdminHeader from "../adminHeader";
import {
  deleteUserChfBankAccountApi,
  deleteUserDkkBankAccountApi,
  deleteUserEuroBankAccountApi,
  deleteUserUsdBankAccountApi,
  getUserChfBankAccountApi,
  getUserDkkBankAccountApi,
  getUserEuroBankAccountApi,
  getUserUsdBankAccountApi,
  signleUsersApi,
  upsertUserChfBankAccountApi,
  upsertUserDkkBankAccountApi,
  upsertUserEuroBankAccountApi,
  upsertUserUsdBankAccountApi,
} from "../../../Api/Service";
import { toast } from "react-toastify";
import { EURO_ACCOUNT_FIELDS, hasEuroBankAccountData } from "../../components/EuroAccountUserCard";
import { getFiatCurrencyByKey } from "../../../utils/euroCoinUtils";
import styles from "./UserEuroAccount.module.css";
import "./style.css";

const EMPTY_FORM = {
  bankName: "",
  accountNumber: "",
  iban: "",
  bankAddress: "",
  beneficiaryName: "",
};

const trimForm = (values) =>
  EURO_ACCOUNT_FIELDS.reduce(
    (acc, { key }) => ({ ...acc, [key]: String(values[key] || "").trim() }),
    {}
  );

const FIAT_API_CONFIG = {
  euro: {
    get: getUserEuroBankAccountApi,
    upsert: upsertUserEuroBankAccountApi,
    delete: deleteUserEuroBankAccountApi,
    accountKey: "euroBankAccount",
    hasKey: "hasEuroBankAccount",
  },
  dollar: {
    get: getUserUsdBankAccountApi,
    upsert: upsertUserUsdBankAccountApi,
    delete: deleteUserUsdBankAccountApi,
    accountKey: "usdBankAccount",
    hasKey: "hasUsdBankAccount",
  },
  "swiss franc": {
    get: getUserChfBankAccountApi,
    upsert: upsertUserChfBankAccountApi,
    delete: deleteUserChfBankAccountApi,
    accountKey: "chfBankAccount",
    hasKey: "hasChfBankAccount",
  },
  "danish krone": {
    get: getUserDkkBankAccountApi,
    upsert: upsertUserDkkBankAccountApi,
    delete: deleteUserDkkBankAccountApi,
    accountKey: "dkkBankAccount",
    hasKey: "hasDkkBankAccount",
  },
};

const UserFiatBankAccount = ({ fiatKey }) => {
  const { id } = useParams();
  const fiat = useMemo(() => getFiatCurrencyByKey(fiatKey), [fiatKey]);
  const apiConfig = FIAT_API_CONFIG[fiatKey];

  const [Active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [userName, setUserName] = useState("");
  const [account, setAccount] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const toggleBar = () => setActive((prev) => !prev);

  const loadData = useCallback(async () => {
    if (!apiConfig) return;

    try {
      setLoading(true);
      const [userRes, accountRes] = await Promise.all([
        signleUsersApi(id),
        apiConfig.get(id),
      ]);

      if (userRes.success) {
        const user = userRes.signleUser;
        setUserName(`${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email);
      }

      if (accountRes.success) {
        const savedAccount = accountRes[apiConfig.accountKey] || null;
        setAccount(savedAccount);
        setIsEditing(!accountRes[apiConfig.hasKey]);
        if (savedAccount) {
          setForm({
            bankName: savedAccount.bankName || "",
            accountNumber: savedAccount.accountNumber || "",
            iban: savedAccount.iban || "",
            bankAddress: savedAccount.bankAddress || "",
            beneficiaryName: savedAccount.beneficiaryName || "",
          });
        } else {
          setForm(EMPTY_FORM);
        }
      } else {
        toast.error(accountRes.msg || `Failed to load ${fiat?.coinName || "fiat"} account`);
      }
    } catch (error) {
      toast.error(`Failed to load ${fiat?.coinName || "fiat"} account`);
    } finally {
      setLoading(false);
    }
  }, [apiConfig, fiat?.coinName, id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSave = async () => {
    const trimmed = trimForm(form);

    try {
      setSaving(true);
      const response = await apiConfig.upsert(id, trimmed);
      if (response.success) {
        toast.success(response.msg || `${fiat.coinName} account saved`);
        setAccount(response[apiConfig.accountKey]);
        setForm(trimmed);
        setIsEditing(!response[apiConfig.hasKey]);
      } else {
        toast.error(response.msg || `Failed to save ${fiat.coinName} account`);
      }
    } catch (error) {
      toast.error(`Failed to save ${fiat.coinName} account`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Remove this user's ${fiat.coinName.toLowerCase()} bank account?`)) {
      return;
    }

    try {
      setDeleting(true);
      const response = await apiConfig.delete(id);
      if (response.success) {
        toast.success(response.msg || `${fiat.coinName} account removed`);
        setAccount(null);
        setForm(EMPTY_FORM);
        setIsEditing(true);
      } else {
        toast.error(response.msg || `Failed to delete ${fiat.coinName} account`);
      }
    } catch (error) {
      toast.error(`Failed to delete ${fiat.coinName} account`);
    } finally {
      setDeleting(false);
    }
  };

  const startEdit = () => {
    setForm({
      bankName: account?.bankName || "",
      accountNumber: account?.accountNumber || "",
      iban: account?.iban || "",
      bankAddress: account?.bankAddress || "",
      beneficiaryName: account?.beneficiaryName || "",
    });
    setIsEditing(true);
  };

  const visibleAccountFields = EURO_ACCOUNT_FIELDS.filter(({ key }) =>
    String(account?.[key] || "").trim()
  );

  const hasSavedAccount = hasEuroBankAccountData(account);

  if (!fiat || !apiConfig) {
    return null;
  }

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

                <div className={`col-span-12 sm:col-span-8 ${styles.euroAccountPage}`}>
                  <div className="space-y-6">
                    <div className={styles.heroCard}>
                      <h1 className={styles.heroTitle} style={{ color: "white" }}>
                        {fiat.adminTitle}
                      </h1>
                      <p className={styles.heroSubtitle}>
                        Manage the linked {fiat.coinName.toLowerCase()} bank account for {userName || "this user"}. Filled fields will appear on the user&apos;s dashboard.
                      </p>
                    </div>

                    <div className={styles.panel}>
                      {loading ? (
                        <div className={styles.loadingWrap}>
                          <Spinner animation="border" variant="primary" />
                        </div>
                      ) : isEditing || !hasSavedAccount ? (
                        <>
                          <div className={styles.panelHeader}>
                            <div>
                              <h2 className={styles.panelTitle}>
                                {hasSavedAccount ? `Edit ${fiat.coinName} Bank Account` : `Add ${fiat.coinName} Bank Account`}
                              </h2>
                              <p className={styles.panelSubtitle}>
                                All fields are optional. Only filled fields will be shown to the user.
                              </p>
                            </div>
                          </div>

                          <div className={styles.formGrid}>
                            {EURO_ACCOUNT_FIELDS.map(({ key, label }) => (
                              <div
                                key={key}
                                className={`${styles.formField} ${key === "bankAddress" ? styles.formFieldFull : ""}`}
                              >
                                <label className={styles.formLabel} htmlFor={key}>
                                  {label}
                                </label>
                                {key === "bankAddress" ? (
                                  <textarea
                                    id={key}
                                    className={styles.formTextarea}
                                    value={form[key]}
                                    onChange={handleChange(key)}
                                    placeholder="Full bank branch address"
                                  />
                                ) : (
                                  <input
                                    id={key}
                                    className={styles.formInput}
                                    value={form[key]}
                                    onChange={handleChange(key)}
                                    placeholder={
                                      key === "bankName"
                                        ? "e.g. Bank name"
                                        : key === "beneficiaryName"
                                          ? "Account holder name"
                                          : key === "accountNumber"
                                            ? "Account number"
                                            : "IBAN"
                                    }
                                  />
                                )}
                              </div>
                            ))}
                          </div>

                          <div className={styles.actionsRow}>
                            <button
                              type="button"
                              className={`${styles.btnPrimary} euro-account-btn`}
                              onClick={handleSave}
                              disabled={saving}
                            >
                              {saving ? "Saving..." : hasSavedAccount ? "Save Changes" : `Add ${fiat.label} Account`}
                            </button>
                            {hasSavedAccount && (
                              <button
                                type="button"
                                className={`${styles.btnSecondary} euro-account-btn`}
                                onClick={() => setIsEditing(false)}
                                disabled={saving}
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className={styles.panelHeader}>
                            <div>
                              <h2 className={styles.panelTitle}>Linked {fiat.coinName} Bank Account</h2>
                              <p className={styles.panelSubtitle}>
                                These fields are visible to the user in their dashboard.
                              </p>
                            </div>
                            <div className={styles.actionsRow}>
                              <button type="button" className={`${styles.btnSecondary} euro-account-btn`} onClick={startEdit}>
                                Edit
                              </button>
                              <button
                                type="button"
                                className={`${styles.btnDanger} euro-account-btn`}
                                onClick={handleDelete}
                                disabled={deleting}
                              >
                                {deleting ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </div>

                          <div className={styles.detailsGrid}>
                            {visibleAccountFields.map(({ key, label }) => (
                              <div
                                key={key}
                                className={`${styles.detailItem} ${key === "bankAddress" ? styles.detailItemFull : ""}`}
                              >
                                <span className={styles.detailLabel}>{label}</span>
                                <p className={styles.detailValue}>{account[key]}</p>
                              </div>
                            ))}
                          </div>

                          {account.updatedAt && (
                            <p className={styles.metaText}>
                              Last updated: {new Date(account.updatedAt).toLocaleString()}
                            </p>
                          )}
                        </>
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

export default UserFiatBankAccount;
