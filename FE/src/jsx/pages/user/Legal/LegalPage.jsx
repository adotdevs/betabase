import React, { useEffect } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import Menu from "../Landing/components/Menu";
import Footer from "../Landing/components/Footer";
import { LEGAL_PAGES, getLegalPage } from "./legalContent";
import noiseBg from "../../../../assets/noise_bg.png";
import styles from "./LegalPage.module.css";

const EMAIL_OR_BOLD = /(\*\*[^*]+\*\*|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/g;

const InlineText = ({ text }) => {
  const parts = String(text).split(EMAIL_OR_BOLD);
  return parts.map((part, index) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.includes("@") && /^[\w.+-]+@/.test(part)) {
      return (
        <a key={index} href={`mailto:${part}`}>
          {part}
        </a>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
};

const LegalPage = () => {
  const { pathname } = useLocation();
  const page = getLegalPage(pathname);

  useEffect(() => {
    if (!page) return;
    window.scrollTo(0, 0);
    document.title = `${page.title} | Betabase`;
    return () => {
      document.title = "Betabase | Be early to the future of finance";
    };
  }, [page]);

  if (!page) {
    return <Navigate to="/" replace />;
  }

  return (
    <div
      className={styles.page}
      style={{ backgroundImage: `url(${noiseBg})` }}
    >
      <Menu hideSectionNav />
      <main className={styles.main}>
        <div className={styles.container}>
          <Link to="/" className={styles.backLink}>
            ← Back to homepage
          </Link>

          <header className={styles.hero}>
            <p className={styles.kicker}>BETA 9 INVESTMENTS PTE. LTD.</p>
            <h1>{page.title}</h1>
          </header>

          <div className={styles.layout}>
            <article className={styles.article}>
              {page.intro.map((paragraph) => (
                <p key={paragraph} className={styles.lead}>
                  <InlineText text={paragraph} />
                </p>
              ))}

              {page.sections.map((section) => {
                const contactBlock = section.contact?.length ? (
                  <div className={styles.contact}>
                    {section.contact.map((line) => (
                      <p key={line}>
                        <InlineText text={line} />
                      </p>
                    ))}
                  </div>
                ) : null;

                return (
                  <section key={section.title} className={styles.section}>
                    <h2>{section.title}</h2>
                    {!section.contactAfter && contactBlock}
                    {section.paragraphs?.map((paragraph) => (
                      <p key={paragraph}>
                        <InlineText text={paragraph} />
                      </p>
                    ))}
                    {section.contactAfter && contactBlock}
                    {section.bullets?.length ? (
                      <ul>
                        {section.bullets.map((item) => (
                          <li key={item}>
                            <InlineText text={item} />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                );
              })}
            </article>

            <aside className={styles.aside}>
              <h2>Legal documents</h2>
              <nav aria-label="Legal documents">
                {LEGAL_PAGES.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={item.path === page.path ? styles.active : undefined}
                    aria-current={item.path === page.path ? "page" : undefined}
                  >
                    {item.title}
                  </Link>
                ))}
              </nav>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default LegalPage;
