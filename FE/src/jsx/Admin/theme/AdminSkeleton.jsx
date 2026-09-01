import React from "react";
import styles from "./AdminSkeleton.module.css";

const Bone = ({ className }) => (
  <span className={`${styles.bone} ${className || ""}`} />
);

const AdminSkeleton = ({ variant = "table", rows = 6 }) => {
  const rowItems = Array.from({ length: rows }, (_, index) => index);

  if (variant === "cards") {
    return (
      <div className={styles.wrap} aria-hidden="true">
        <div className={styles.cardGrid}>
          {rowItems.slice(0, 3).map((index) => (
            <div key={index} className={styles.card}>
              <div className={styles.cardHead}>
                <Bone className={styles.avatar} />
                <div className={styles.cardMeta}>
                  <Bone className={styles.lineLg} />
                  <Bone className={styles.lineSm} />
                </div>
              </div>
              <Bone className={styles.line} />
              <Bone className={styles.lineMed} />
              <Bone className={styles.lineShort} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "stats") {
    return (
      <div className={styles.wrap} aria-hidden="true">
        <div className={styles.statGrid}>
          {rowItems.slice(0, 4).map((index) => (
            <div key={index} className={styles.stat}>
              <Bone className={styles.lineSm} />
              <Bone className={styles.statValue} />
            </div>
          ))}
        </div>
        <AdminSkeleton variant="table" rows={5} />
      </div>
    );
  }

  if (variant === "form") {
    return (
      <div className={styles.wrap} aria-hidden="true">
        <div className={styles.panel}>
          <div className={styles.cardHead}>
            <Bone className={styles.avatar} />
            <div className={styles.cardMeta}>
              <Bone className={styles.lineLg} />
              <Bone className={styles.lineSm} />
            </div>
          </div>
          {rowItems.slice(0, 6).map((index) => (
            <Bone key={index} className={styles.formField} />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "ticket") {
    return (
      <div className={styles.wrap} aria-hidden="true">
        <div className={styles.toolbar}>
          <Bone className={styles.avatar} />
          <Bone className={styles.lineLg} />
          <Bone className={styles.chip} />
        </div>
        <div className={styles.ticketGrid}>
          <div className={styles.panel}>
            {rowItems.slice(0, 4).map((index) => (
              <Bone key={index} className={styles.msg} />
            ))}
          </div>
          <div className={styles.panel}>
            <Bone className={styles.lineLg} />
            <Bone className={styles.line} />
            <Bone className={styles.lineMed} />
            <Bone className={styles.lineShort} />
          </div>
        </div>
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className={`${styles.wrap} ${styles.table}`} aria-hidden="true">
        {rowItems.map((index) => (
          <div key={index} className={styles.listRow}>
            <Bone className={styles.avatar} />
            <div className={styles.cardMeta}>
              <Bone className={styles.lineLg} />
              <Bone className={styles.lineSm} />
            </div>
            <Bone className={styles.chip} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "panel") {
    return (
      <div className={styles.wrap} aria-hidden="true">
        <div className={styles.panel}>
          <Bone className={styles.lineLg} />
          <Bone className={styles.line} />
          <Bone className={styles.block} />
        </div>
      </div>
    );
  }

  if (variant === "docs") {
    return (
      <div className={styles.wrap} aria-hidden="true">
        <div className={styles.docGrid}>
          {rowItems.slice(0, 2).map((index) => (
            <div key={index} className={styles.panel}>
              <Bone className={styles.lineLg} />
              <Bone className={styles.lineMed} />
              <Bone className={styles.block} />
              <div className={styles.toolbar}>
                <Bone className={styles.chip} />
                <Bone className={styles.chip} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "switchCard") {
    return (
      <div className={styles.card} aria-hidden="true">
        <div className={styles.cardHead}>
          <Bone className={styles.lineLg} />
          <Bone className={styles.switch} />
        </div>
        <Bone className={styles.line} />
        <Bone className={styles.lineMed} />
      </div>
    );
  }

  return (
    <div className={styles.wrap} aria-hidden="true">
      <div className={styles.toolbar}>
        <Bone className={styles.search} />
        <Bone className={styles.chip} />
        <Bone className={styles.chip} />
      </div>
      <div className={styles.table}>
        <div className={styles.tableHead}>
          <Bone className={styles.lineSm} />
          <Bone className={styles.lineSm} />
          <Bone className={styles.lineSm} />
          <Bone className={styles.lineSm} />
          <Bone className={styles.lineSm} />
        </div>
        {rowItems.map((index) => (
          <div key={index} className={styles.row}>
            <Bone className={styles.lineMed} />
            <Bone className={styles.line} />
            <Bone className={styles.lineShort} />
            <Bone className={styles.chip} />
            <Bone className={styles.lineSm} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminSkeleton;
