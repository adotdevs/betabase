import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { getTicketAttachmentApi } from "../../../Api/Service";
import { getKycDocumentPreviewUrl } from "../../../utils/cloudinaryKyc";
import styles from "./TicketAttachments.module.css";

export const TICKET_MAX_FILES = 5;
export const TICKET_MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

const isAllowedFile = (file) =>
  ALLOWED_TYPES.has(file.type) || file.name?.toLowerCase().endsWith(".pdf");

const isPdfFile = (fileOrAttachment) => {
  const mime = String(fileOrAttachment?.type || fileOrAttachment?.mimeType || "").toLowerCase();
  if (mime === "application/pdf") return true;
  const name = String(fileOrAttachment?.name || fileOrAttachment?.fileName || "").toLowerCase();
  if (name.endsWith(".pdf")) return true;
  const url = String(fileOrAttachment?.url || "").toLowerCase();
  return url.includes(".pdf") || url.includes("/raw/upload/");
};

export const isImageAttachment = (attachment) => {
  if (!attachment) return false;
  if (isPdfFile(attachment)) return false;

  const mime = String(attachment?.type || attachment?.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return true;

  const name = String(attachment?.name || attachment?.fileName || "").toLowerCase();
  if (/\.(jpe?g|png|gif|webp|bmp|svg)$/.test(name)) return true;

  const url = String(attachment?.url || "").toLowerCase();
  if (/\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/.test(url)) return true;
  if (url.includes("/image/upload/")) return true;

  return Boolean(attachment?.url) && !isPdfFile(attachment);
};

export const appendTicketAttachments = (formData, files = []) => {
  files.forEach((file) => formData.append("attachments", file));
};

const PendingPreview = ({ file, onRemove, disabled }) => {
  const previewUrl = useMemo(() => {
    if (!isImageAttachment(file)) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const isPdf = isPdfFile(file);

  return (
    <div className={styles.pendingCard}>
      <button
        type="button"
        className={styles.pendingRemove}
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
      >
        ×
      </button>
      {previewUrl ? (
        <div className={styles.pendingThumbWrap}>
          <img src={previewUrl} alt={file.name} className={styles.pendingThumb} />
        </div>
      ) : (
        <div className={`${styles.pendingThumbWrap} ${styles.pendingPdf}`}>
          <span className={styles.pdfIcon} aria-hidden="true">PDF</span>
        </div>
      )}
      <span className={styles.pendingName} title={file.name}>
        {file.name}
      </span>
      <span className={styles.pendingMeta}>{isPdf ? "Document" : "Image"}</span>
    </div>
  );
};

export const TicketAttachmentInput = ({ files = [], onChange, disabled = false }) => {
  const inputRef = useRef(null);

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    const next = [...files];
    for (const file of incoming) {
      if (next.length >= TICKET_MAX_FILES) {
        toast.error(`Maximum ${TICKET_MAX_FILES} attachments allowed`);
        break;
      }
      if (!isAllowedFile(file)) {
        toast.error(`${file.name}: only images and PDF are allowed`);
        continue;
      }
      if (file.size > TICKET_MAX_FILE_SIZE) {
        toast.error(`${file.name} is too large (max 10MB)`);
        continue;
      }
      next.push(file);
    }
    onChange(next);
  };

  const removeFile = (index) => {
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.attachBtn}
          disabled={disabled || files.length >= TICKET_MAX_FILES}
          onClick={() => inputRef.current?.click()}
        >
          Attach files
        </button>
        <span className={styles.hint}>
          Images or PDF · up to {TICKET_MAX_FILES} files · 10MB each
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        className={styles.hiddenInput}
        accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.pdf"
        multiple
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {files.length > 0 && (
        <div className={styles.pendingGrid}>
          {files.map((file, index) => (
            <PendingPreview
              key={`${file.name}-${file.size}-${index}`}
              file={file}
              disabled={disabled}
              onRemove={() => removeFile(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const MessageAttachmentCard = ({ attachment, index, userId, ticketId, messageId }) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const label = attachment.fileName || `Attachment ${index + 1}`;
  const isPdf = isPdfFile(attachment);
  const isImage = isImageAttachment(attachment) && !failed && !isPdf;
  const pdfPreviewUrl = isPdf ? getKycDocumentPreviewUrl(attachment.url) : null;

  const downloadPdfAttachment = async () => {
    if (!userId || !ticketId || !messageId) {
      toast.error("Unable to download this attachment.");
      return;
    }

    setDownloading(true);
    try {
      const response = await getTicketAttachmentApi(
        userId,
        ticketId,
        messageId,
        index
      );
      const blobData = response?.data;
      if (!(blobData instanceof Blob)) {
        throw new Error("Invalid download response");
      }

      const blob =
        blobData.type === "application/pdf"
          ? blobData
          : new Blob([blobData], { type: "application/pdf" });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const downloadName = label.toLowerCase().endsWith(".pdf") ? label : `${label}.pdf`;
      link.href = objectUrl;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      toast.error(error?.message || "Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  };

  if (isImage) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.messageCard}
        title={`Open ${label}`}
      >
        <div className={styles.messageThumbWrap}>
          {!loaded && <div className={styles.messageSkeleton} aria-hidden="true" />}
          <img
            src={attachment.url}
            alt={label}
            className={`${styles.messageThumb} ${loaded ? styles.messageThumbLoaded : ""}`}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        </div>
        <span className={styles.messageCaption}>{label}</span>
      </a>
    );
  }

  if (isPdf) {
    return (
      <button
        type="button"
        className={`${styles.messageCard} ${styles.messagePdfCard} ${styles.messageCardButton}`}
        title={`Download ${label}`}
        onClick={downloadPdfAttachment}
        disabled={downloading}
      >
        <div className={`${styles.messageThumbWrap} ${styles.pendingPdf}`}>
          {pdfPreviewUrl && !failed ? (
            <>
              {!loaded && <div className={styles.messageSkeleton} aria-hidden="true" />}
              <img
                src={pdfPreviewUrl}
                alt={`${label} preview`}
                className={`${styles.messageThumb} ${loaded ? styles.messageThumbLoaded : ""}`}
                loading="lazy"
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
              />
            </>
          ) : (
            <span className={styles.pdfIcon}>PDF</span>
          )}
        </div>
        <span className={styles.messageCaption}>
          {downloading ? "Downloading..." : label}
        </span>
      </button>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${styles.messageCard} ${styles.messagePdfCard}`}
      title={`Open ${label}`}
    >
      <div className={`${styles.messageThumbWrap} ${styles.pendingPdf}`}>
        <span className={styles.pdfIcon}>PDF</span>
      </div>
      <span className={styles.messageCaption}>{label}</span>
    </a>
  );
};

export const TicketMessageAttachments = ({
  attachments = [],
  userId,
  ticketId,
  messageId,
}) => {
  if (!attachments?.length) return null;

  return (
    <div className={styles.messageGallery}>
      {attachments.map((attachment, index) => (
        <MessageAttachmentCard
          key={`${attachment.url || attachment.fileName}-${index}`}
          attachment={attachment}
          index={index}
          userId={userId}
          ticketId={ticketId}
          messageId={messageId}
        />
      ))}
    </div>
  );
};

const EditAttachmentPreview = ({ attachment, index, onRemove, disabled }) => {
  const [loaded, setLoaded] = useState(false);
  const label = attachment.fileName || `Attachment ${index + 1}`;
  const isPdf = isPdfFile(attachment);
  const isImage = isImageAttachment(attachment);
  const pdfPreviewUrl = isPdf ? getKycDocumentPreviewUrl(attachment.url) : null;
  const thumbUrl = isImage ? attachment.url : pdfPreviewUrl;

  return (
    <div className={styles.pendingCard}>
      <button
        type="button"
        className={styles.pendingRemove}
        disabled={disabled}
        onClick={() => onRemove(index)}
        aria-label={`Remove ${label}`}
      >
        ×
      </button>
      {thumbUrl ? (
        <div className={styles.pendingThumbWrap}>
          {!loaded && <div className={styles.messageSkeleton} aria-hidden="true" />}
          <img
            src={thumbUrl}
            alt={label}
            className={`${styles.pendingThumb} ${loaded ? styles.messageThumbLoaded : ""}`}
            onLoad={() => setLoaded(true)}
          />
        </div>
      ) : (
        <div className={`${styles.pendingThumbWrap} ${styles.pendingPdf}`}>
          <span className={styles.pdfIcon} aria-hidden="true">PDF</span>
        </div>
      )}
      <span className={styles.pendingName} title={label}>
        {label}
      </span>
      <span className={styles.pendingMeta}>{isPdf ? "Document" : "Image"}</span>
    </div>
  );
};

export const TicketEditAttachments = ({
  attachments = [],
  removedIndexes = [],
  onRemove,
  disabled = false,
}) => {
  const removedSet = new Set(removedIndexes);
  const visible = attachments
    .map((attachment, index) => ({ attachment, index }))
    .filter(({ index }) => !removedSet.has(index));

  if (!visible.length) return null;

  return (
    <div className={styles.editAttachmentsWrap}>
      <span className={styles.editAttachmentsLabel}>Attached files</span>
      <div className={styles.pendingGrid}>
        {visible.map(({ attachment, index }) => (
          <EditAttachmentPreview
            key={`${attachment.url || attachment.fileName}-${index}`}
            attachment={attachment}
            index={index}
            onRemove={onRemove}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
};
