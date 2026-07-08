import React, { useEffect, useState } from "react";
import SideBar from "../../layouts/AdminSidebar/Sidebar";
import UserSideBar from "./UserSideBar";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthUser } from "react-auth-kit";
import {
  getKycDocumentApi,
  patchCoinsApi,
  signleUsersApi,
  updateKycApi,
} from "../../../Api/Service";
import {
  getKycDocumentPreviewUrl,
  isCloudinaryPdfUrl,
} from "../../../utils/cloudinaryKyc";
import { toast } from "react-toastify";
import AdminHeader from "../adminHeader";

const ShieldIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
    <path d="M12 13q1.45 0 2.475-1.025T15.5 9.5q0-1.45-1.025-2.475T12 6q-1.45 0-2.475 1.025T8.5 9.5q0 1.45 1.025 2.475T12 13m0 6.9q1.475-.475 2.613-1.487t1.987-2.288q-1.075-.55-2.238-.837T12 15q-1.2 0-2.363.288t-2.237.837q.85 1.275 1.988 2.288T12 19.9m0 2q-.175 0-.325-.025t-.3-.075Q8 20.675 6 17.638T4 11.1V6.375q0-.625.363-1.125t.937-.725l6-2.25q.35-.125.7-.125t.7.125l6 2.25q.575.225.938.725T20 6.375V11.1q0 3.5-2 6.538T12.625 21.8q-.15.05-.3.075T12 21.9" />
  </svg>
);

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
  </svg>
);

const DocumentIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-muted-400">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const UserVerifications = () => {
  const { id } = useParams();
  const authUser = useAuthUser();
  const Navigate = useNavigate();
  const [isDisable, setisDisable] = useState(false);
  const [UserData, setUserData] = useState({});
  const [previewErrors, setPreviewErrors] = useState({ cnic: false, bill: false });
  const [Active, setActive] = useState(false);

  const toggleBar = () => setActive((prev) => !prev);

  const getSignleUser = async () => {
    try {
      const signleUser = await signleUsersApi(id);
      if (signleUser.success) {
        setUserData(signleUser.signleUser);
      } else {
        toast.dismiss();
        toast.error(signleUser.msg);
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error?.message || "Failed to load user");
    } finally {
      setisDisable(false);
    }
  };

  const updateKyc = async (approve) => {
    try {
      setisDisable(true);
      const body = {
        kyc: approve,
        status: approve ? "completed" : "pending",
      };
      const signleUser = await updateKycApi(id, body);
      await patchCoinsApi(id);

      if (signleUser.success) {
        toast.dismiss();
        toast.success(signleUser.msg);
        getSignleUser();
      } else {
        toast.dismiss();
        toast.error(signleUser.msg);
        setisDisable(false);
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error?.message || "Failed to update KYC");
      setisDisable(false);
    }
  };

  const downloadPdfDocument = (docType, filename) => {
    getKycDocumentApi(id, docType).then((response) => {
      const blobData = response?.data;
      if (!(blobData instanceof Blob)) {
        return;
      }

      const blob =
        blobData.type === "application/pdf"
          ? blobData
          : new Blob([blobData], { type: "application/pdf" });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${filename}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    });
  };

  const renderDocumentCard = ({
    title,
    subtitle,
    url,
    docType,
    fileLabel,
  }) => {
    const isPdf = isCloudinaryPdfUrl(url);
    const previewUrl = isPdf ? getKycDocumentPreviewUrl(url) : url;
    const hasPreviewError = previewErrors[docType];

    return (
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-muted-200 bg-white shadow-sm dark:border-muted-700 dark:bg-muted-900">
        <div className="border-b border-muted-200 px-5 py-4 dark:border-muted-700">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-heading text-base font-semibold text-muted-800 dark:text-muted-100">
                {title}
              </h3>
              <p className="mt-0.5 text-sm text-muted-500 dark:text-muted-400">
                {subtitle}
              </p>
            </div>
            {isPdf ? (
              <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                PDF
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                Image
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col p-5">
          <div className="relative mb-4 flex min-h-[280px] flex-1 items-center justify-center overflow-hidden rounded-lg border border-dashed border-muted-200 bg-muted-50 dark:border-muted-700 dark:bg-muted-800/50">
            {hasPreviewError ? (
              <div className="flex flex-col items-center gap-2 px-4 text-center">
                <DocumentIcon />
                <p className="text-sm text-muted-500">Preview unavailable</p>
              </div>
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt={`${title} preview`}
                className="max-h-[320px] w-full object-contain"
                onError={() =>
                  setPreviewErrors((prev) => ({ ...prev, [docType]: true }))
                }
              />
            ) : (
              <div className="flex flex-col items-center gap-2 px-4 text-center">
                <DocumentIcon />
                <p className="text-sm text-muted-500">No preview available</p>
              </div>
            )}
          </div>

          {isPdf ? (
            <button
              type="button"
              onClick={() => downloadPdfDocument(docType, fileLabel)}
              className="relative inline-flex items-center gap-2 rounded-md border border-info-500 bg-info-500 px-4 py-2 text-sm font-normal text-white transition hover:bg-info-400"
            >
              <DownloadIcon />
              Download PDF
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (authUser().user.role === "user") {
      Navigate("/dashboard");
      return;
    }
    getSignleUser();
  }, []);

  const submitDoc = UserData.submitDoc;
  const hasSubmittedDocs =
    submitDoc?.status === "completed" && submitDoc?.cnic && submitDoc?.bill;
  const submissionLabel =
    submitDoc?.status === "completed"
      ? "Documents submitted"
      : submitDoc?.status === "pending"
        ? "Awaiting submission"
        : "Loading...";
  const kycApproved = UserData.kyc === true;
  const userName = [UserData.firstName, UserData.lastName].filter(Boolean).join(" ");

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

                <div className="col-span-12 sm:col-span-8">
                  <div className="space-y-6">
                    {/* Header card */}
                    <div className="overflow-hidden rounded-xl border border-muted-200 bg-white shadow-sm dark:border-muted-700 dark:bg-muted-900">
                      <div className="border-b border-muted-200 px-6 py-5 dark:border-muted-700">
                        <div className="flex flex-col gap-4">
                          <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-500/15 text-primary-500">
                              <ShieldIcon />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h1 className="font-heading text-xl font-semibold text-muted-900 dark:text-muted-50">
                                KYC Verification
                              </h1>
                              <p className="mt-1 text-sm text-muted-500 dark:text-muted-400">
                                Review identity documents before approving access
                                {userName ? ` for ${userName}` : ""}.
                              </p>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                                    kycApproved
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                                      : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                                  }`}
                                >
                                  {kycApproved ? "KYC Approved" : "KYC Pending"}
                                </span>
                                <span className="inline-flex items-center rounded-full bg-muted-100 px-3 py-1 text-xs font-medium text-muted-600 dark:bg-muted-800 dark:text-muted-300">
                                  {submissionLabel}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex w-full items-center justify-end border-t border-muted-200 pt-4 dark:border-muted-700">
                            {!kycApproved ? (
                              <button
                                onClick={() => updateKyc(true)}
                                type="button"
                                disabled={isDisable }
                                className="relative inline-flex h-10 min-w-[140px] items-center justify-center rounded-md border border-info-500 bg-info-500 px-5 py-2 text-sm font-normal text-white transition-all duration-300 hover:bg-info-400 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isDisable ? (
                                  <span className="nui-placeload animate-nui-placeload h-4 w-16 rounded" />
                                ) : (
                                  "Approve KYC"
                                )}
                              </button>
                            ) : (
                              <button
                                onClick={() => updateKyc(false)}
                                type="button"
                                disabled={isDisable}
                                className="relative inline-flex h-10 min-w-[140px] items-center justify-center rounded-md border border-danger-500 bg-danger-500 px-5 py-2 text-sm font-normal text-white transition-all duration-300 hover:bg-danger-400 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isDisable ? (
                                  <span className="nui-placeload animate-nui-placeload h-4 w-16 rounded" />
                                ) : (
                                  "Revoke KYC"
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {!hasSubmittedDocs && (
                        <div className="px-6 py-8 text-center">
                          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted-100 dark:bg-muted-800">
                            <DocumentIcon />
                          </div>
                          <h2 className="text-lg font-semibold text-muted-800 dark:text-muted-100">
                            No documents to review
                          </h2>
                          <p className="mx-auto mt-2 max-w-md text-sm text-muted-500 dark:text-muted-400">
                            This user has not submitted both required KYC documents yet.
                            Approval will be available once ID and proof of address are uploaded.
                          </p>
                        </div>
                      )}
                    </div>

                    {hasSubmittedDocs && (
                      <>
                        <div className="grid gap-6 md:grid-cols-2">
                          {renderDocumentCard({
                            title: "Government ID",
                            subtitle: "Passport, national ID, or driving licence",
                            url: submitDoc.cnic,
                            docType: "cnic",
                            fileLabel: `${userName || "user"}-id-document`.replace(/\s+/g, "-").toLowerCase(),
                          })}
                          {renderDocumentCard({
                            title: "Proof of Address",
                            subtitle: "Utility bill, bank statement, or council tax",
                            url: submitDoc.bill,
                            docType: "bill",
                            fileLabel: `${userName || "user"}-proof-of-address`.replace(/\s+/g, "-").toLowerCase(),
                          })}
                        </div>

                        <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 dark:border-blue-900/50 dark:bg-blue-950/30">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400">
                            <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836a1.125 1.125 0 01-1.683.622l-.984-.984a.75.75 0 111.06-1.06l.547.547 1.06-4.242-1.06 4.242-1.437-.718zM12 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                          </svg>
                          <div>
                            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                              Before you approve
                            </p>
                            <p className="mt-1 text-sm text-blue-800/90 dark:text-blue-200/80">
                              Confirm the name and address match the user profile. Approving or
                              revoking KYC will permanently remove the uploaded documents from
                              storage.
                            </p>
                          </div>
                        </div>
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
  );
};

export default UserVerifications;
