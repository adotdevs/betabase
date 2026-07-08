import { getLeadStatusesApi } from "../../../../Api/Service";

let cachedStatuses = null;
let inflightRequest = null;
const listeners = new Set();

const notifyListeners = () => {
    if (!cachedStatuses) return;
    listeners.forEach((listener) => listener(cachedStatuses));
};

export const subscribeLeadStatuses = (listener) => {
    listeners.add(listener);
    if (cachedStatuses) {
        listener(cachedStatuses);
    }
    return () => listeners.delete(listener);
};

export const invalidateLeadStatuses = () => {
    // Keep cached statuses visible until the refreshed list arrives.
    inflightRequest = null;
};

export const fetchLeadStatuses = async ({ force = false } = {}) => {
    if (!force && cachedStatuses) {
        return cachedStatuses;
    }
    if (inflightRequest) {
        return inflightRequest;
    }

    inflightRequest = getLeadStatusesApi()
        .then((res) => {
            if (res.success) {
                cachedStatuses = res.statuses || [];
                notifyListeners();
            }
            inflightRequest = null;
            return cachedStatuses || [];
        })
        .catch((err) => {
            inflightRequest = null;
            throw err;
        });

    return inflightRequest;
};

export const getCachedLeadStatuses = () => cachedStatuses;
