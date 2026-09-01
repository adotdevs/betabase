import {
  getAllTokensApi,
  getCoinsApi,
  getLoanApplicationByUserApi,
  signleUsersApi,
} from "../../../../Api/Service";

const cache = new Map();
const overviewInflight = new Map();
const loanInflight = new Map();

export const readHubCache = (id) => cache.get(id) || null;

export const writeLoanCache = (id, loan) => {
  if (!id) return;
  cache.set(id, { ...cache.get(id), loan });
};

export const clearLoanCache = (id) => {
  if (!id) return;
  const hit = cache.get(id);
  if (!hit) return;
  const next = { ...hit };
  delete next.loan;
  cache.set(id, next);
};

export const loadHubOverviewOnce = (id) => {
  if (!id) return Promise.resolve(null);
  const hit = cache.get(id);
  if (hit?.overview) return Promise.resolve(hit.overview);
  if (overviewInflight.has(id)) return overviewInflight.get(id);

  const job = Promise.all([signleUsersApi(id), getCoinsApi(id), getAllTokensApi(id)])
    .then(([userRes, coinRes, tokenRes]) => {
      const overview = { userRes, coinRes, tokenRes };
      cache.set(id, { ...cache.get(id), overview });
      overviewInflight.delete(id);
      return overview;
    })
    .catch((error) => {
      overviewInflight.delete(id);
      throw error;
    });

  overviewInflight.set(id, job);
  return job;
};

export const loadLoanOnce = (id) => {
  if (!id) return Promise.resolve(null);
  const hit = cache.get(id);
  if (hit && Object.prototype.hasOwnProperty.call(hit, "loan")) {
    return Promise.resolve(hit.loan);
  }
  if (loanInflight.has(id)) return loanInflight.get(id);

  const job = getLoanApplicationByUserApi(id)
    .then((res) => {
      const loan = res?.success ? res.application || null : null;
      cache.set(id, { ...cache.get(id), loan });
      loanInflight.delete(id);
      return loan;
    })
    .catch(() => {
      cache.set(id, { ...cache.get(id), loan: null });
      loanInflight.delete(id);
      return null;
    });

  loanInflight.set(id, job);
  return job;
};
