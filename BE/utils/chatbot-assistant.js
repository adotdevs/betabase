const OpenAI = require("openai");

const PROFILES = {
  default: {
    key: "default",
    assistantIdEnv: "OPENAI_ASSISTANT_ID",
    apiKeyEnv: "OPENAI_API_KEY",
    emailFromName: null,
    useWidgetAssistant: false,
  },
  widget: {
    key: "widget",
    assistantIdEnv: "OPENAI_ASSISTANT_ID_TWO",
    apiKeyEnv: "OPENAI_API_KEY",
    emailFromName: "Chain Assistant",
    useWidgetAssistant: true,
  },
  investandmigrate: {
    key: "investandmigrate",
    assistantIdEnv: "OPENAI_ASSISTANT_ID_INVESTANDMIGRATE",
    apiKeyEnv: "OPENAI_API_KEY_INVESTANDMIGRATE",
    emailFromName: "InvestAndMigrate Assistant",
    useWidgetAssistant: false,
  },
};

const clientCache = new Map();

function getOpenAIClient(apiKey) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!clientCache.has(key)) {
    clientCache.set(key, new OpenAI({ apiKey: key }));
  }
  return clientCache.get(key);
}

function getProfileByAssistantId(assistantId) {
  if (!assistantId || typeof assistantId !== "string") return null;
  const trimmed = assistantId.trim();
  for (const profile of Object.values(PROFILES)) {
    const id = process.env[profile.assistantIdEnv];
    if (id && trimmed === id) return profile;
  }
  return null;
}

function resolveAssistantSelection({ useWidgetAssistant, assistantId, assistantKey, session }) {
  let profileKey = null;

  if (typeof assistantKey === "string" && assistantKey.trim()) {
    const key = assistantKey.trim().toLowerCase();
    if (PROFILES[key]) profileKey = key;
  }

  if (!profileKey && typeof assistantId === "string" && assistantId.trim()) {
    const byId = getProfileByAssistantId(assistantId);
    if (byId) profileKey = byId.key;
  }

  if (!profileKey && session?.assistantKey && PROFILES[session.assistantKey]) {
    profileKey = session.assistantKey;
  }

  if (!profileKey && session?.useWidgetAssistant) {
    profileKey = "widget";
  }

  if (!profileKey && typeof useWidgetAssistant === "boolean") {
    profileKey = useWidgetAssistant ? "widget" : "default";
  }

  if (!profileKey) profileKey = "default";

  const profile = PROFILES[profileKey];
  const resolvedAssistantId = process.env[profile.assistantIdEnv];
  const apiKey = process.env[profile.apiKeyEnv] || process.env.OPENAI_API_KEY;

  return {
    profileKey,
    assistantId: resolvedAssistantId,
    apiKey,
    emailFromName: profile.emailFromName,
    useWidgetAssistant: profile.useWidgetAssistant,
  };
}

function getSessionFieldsFromSelection(selection) {
  return {
    assistantKey: selection.profileKey === "default" ? null : selection.profileKey,
    useWidgetAssistant: selection.useWidgetAssistant,
  };
}

module.exports = {
  PROFILES,
  resolveAssistantSelection,
  getOpenAIClient,
  getSessionFieldsFromSelection,
  getProfileByAssistantId,
};
