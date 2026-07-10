import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuthUser } from "react-auth-kit";
import { createTicketApi, signleUsersApi } from "../../Api/Service";
import {
  TicketAttachmentInput,
  appendTicketAttachments,
} from "../components/tickets/TicketAttachments";
import { isEmptyRichText } from "../../utils/emailTemplateUtils";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import profile from "../../assets/images/7309681.jpg";
import styles from "./CreateTicket.module.css";
import {
  ArrowBack as ArrowBackIcon,
  Send as SendIcon,
} from "@mui/icons-material";

const CreateTicket = () => {
  const { id, email } = useParams();
  const authUser = useAuthUser();
  const navigate = useNavigate();

  const [ticketUser, setTicketUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [isDisable, setIsDisable] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState([]);

  const loadUser = async () => {
    try {
      setUserLoading(true);
      const response = await signleUsersApi(id);
      if (response.success) {
        setTicketUser(response.signleUser);
      }
    } catch {
      setTicketUser(null);
    } finally {
      setUserLoading(false);
    }
  };

  const sendTicket = async () => {
    try {
      setIsDisable(true);

      if (!title.trim()) {
        toast.error("Title is required");
        return;
      }

      if (isEmptyRichText(description) && attachments.length === 0) {
        toast.error("Add a description or at least one attachment");
        return;
      }

      const formData = new FormData();
      formData.append("userId", id);
      formData.append("title", title.trim());
      formData.append("description", description.trim());
      formData.append("isAdmin", "true");
      appendTicketAttachments(formData, attachments);

      const response = await createTicketApi(formData);

      if (response.success) {
        toast.success("Ticket created successfully");
        navigate("/admin/support");
        return;
      }

      toast.error(response.msg || "Failed to create ticket");
    } catch (error) {
      toast.error(error?.message || "Failed to create ticket");
    } finally {
      setIsDisable(false);
    }
  };

  useEffect(() => {
    const role = authUser()?.user?.role;
    if (role === "user") {
      navigate("/dashboard");
      return;
    }
    if (!["admin", "superadmin", "subadmin"].includes(role)) {
      navigate("/login");
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [id]);

  const displayEmail = ticketUser?.email || decodeURIComponent(email || "");
  const displayName = ticketUser
    ? `${ticketUser.firstName || ""} ${ticketUser.lastName || ""}`.trim()
    : "Customer";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => navigate("/admin/support")}
          aria-label="Back to support"
        >
          <ArrowBackIcon fontSize="small" />
        </button>
        <div>
          <h1 className={styles.pageTitle}>Create Ticket</h1>
          <p className={styles.pageSubtitle}>
            Open a support ticket on behalf of this user
          </p>
        </div>
      </header>

      <div className={styles.layout}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div className={styles.panelIcon} aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v2h-2v-2zm0-10h2v8h-2V7z" />
              </svg>
            </div>
            <div>
              <h2 className={styles.panelTitle}>Ticket details</h2>
              <p className={styles.panelHint}>
                The first message will be sent as support staff
              </p>
            </div>
          </div>

          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              sendTicket();
            }}
          >
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ticket-title">
                Title
              </label>
              <input
                id="ticket-title"
                type="text"
                className={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief summary of the issue"
                disabled={isDisable}
                autoComplete="off"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="ticket-description">
                Description
              </label>
              <div className={styles.editorWrap} id="ticket-description">
                <ReactQuill
                  theme="snow"
                  value={description}
                  onChange={setDescription}
                  placeholder="Describe the issue or initial response..."
                  readOnly={isDisable}
                  modules={{
                    toolbar: [
                      ["bold", "italic", "underline"],
                      [{ list: "ordered" }, { list: "bullet" }],
                      [{ color: [] }],
                      ["link", "clean"],
                    ],
                  }}
                />
              </div>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Attachments</span>
              <TicketAttachmentInput
                files={attachments}
                onChange={setAttachments}
                disabled={isDisable}
              />
            </div>

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={isDisable}
            >
              {isDisable ? (
                <>
                  <span className={styles.submitSpinner} aria-hidden="true" />
                  Creating ticket...
                </>
              ) : (
                <>
                  <SendIcon sx={{ fontSize: 18 }} />
                  Create ticket
                </>
              )}
            </button>
          </form>
        </section>

        <aside className={`${styles.panel} ${styles.panelSticky}`}>
          <h2 className={styles.sideTitle}>Customer</h2>

          {userLoading ? (
            <div className={styles.loadingWrap}>
              <span className={styles.loadingSpinner} aria-label="Loading customer" />
            </div>
          ) : (
            <>
              <button
                type="button"
                className={styles.userCard}
                onClick={() => navigate(`/admin/user/${id}/general`)}
              >
                <img src={profile} alt="" className={styles.avatar} />
                <div className={styles.userMeta}>
                  <p className={styles.userName}>{displayName || "Customer"}</p>
                  <p className={styles.userLink}>View profile</p>
                </div>
              </button>

              <hr className={styles.divider} />

              <div className={styles.metaBlock}>
                <span className={styles.metaLabel}>Email</span>
                <p className={styles.metaValue}>{displayEmail}</p>
              </div>

              <hr className={styles.divider} />

              <div className={styles.metaBlock}>
                <span className={styles.metaLabel}>User ID</span>
                <p className={styles.metaValueAccent}>{id}</p>
              </div>

              <hr className={styles.divider} />

              <p className={styles.note}>
                This ticket will appear in the user&apos;s support inbox and in the
                admin support queue. They will be notified by email when created.
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
};

export default CreateTicket;
