export const EMAIL_TEMPLATE_VARIABLES = [
  { key: "{{name}}", label: "Your full name" },
  { key: "{{firstName}}", label: "Your first name" },
  { key: "{{lastName}}", label: "Your last name" },
  { key: "{{email}}", label: "Your email" },
  { key: "{{phone}}", label: "Your phone number" },
  { key: "{{role}}", label: "Your role" },
  { key: "{{customerName}}", label: "Customer full name" },
  { key: "{{customerFirstName}}", label: "Customer first name" },
  { key: "{{customerLastName}}", label: "Customer last name" },
  { key: "{{customerEmail}}", label: "Customer email" },
  { key: "{{customerPhone}}", label: "Customer phone" },
];

export const buildEmailTemplateContext = ({ staffUser, recipient }) => {
  const staffFirst = staffUser?.firstName || "";
  const staffLast = staffUser?.lastName || "";
  const recipientFirst = recipient?.firstName || "";
  const recipientLast = recipient?.lastName || "";

  return {
    "{{name}}": `${staffFirst} ${staffLast}`.trim(),
    "{{firstName}}": staffFirst,
    "{{lastName}}": staffLast,
    "{{email}}": staffUser?.email || "",
    "{{phone}}": staffUser?.phone || "",
    "{{role}}": staffUser?.role || "",
    "{{customerName}}": `${recipientFirst} ${recipientLast}`.trim(),
    "{{customerFirstName}}": recipientFirst,
    "{{customerLastName}}": recipientLast,
    "{{customerEmail}}": recipient?.email || "",
    "{{customerPhone}}": recipient?.phone || "",
  };
};

export const applyEmailTemplate = (content, contextMap) => {
  let result = content || "";
  EMAIL_TEMPLATE_VARIABLES.forEach(({ key }) => {
    const value = contextMap[key] ?? "";
    result = result.split(key).join(value);
  });
  return result;
};

export const htmlToPlainText = (html) => {
  if (!html) return "";
  if (typeof document !== "undefined") {
    const div = document.createElement("div");
    div.innerHTML = html;
    return (div.textContent || div.innerText || "").trim();
  }
  return String(html).replace(/<[^>]*>/g, "").trim();
};

export const isEmptyRichText = (html) => !htmlToPlainText(html);

export const messageContainsHtml = (text) => /<[^>]+>/.test(text || "");

// Backward-compatible aliases
export const TICKET_TEMPLATE_VARIABLES = EMAIL_TEMPLATE_VARIABLES;
export const LEAD_TEMPLATE_VARIABLES = EMAIL_TEMPLATE_VARIABLES;
export const applyTicketEmailTemplate = applyEmailTemplate;
export const applyLeadEmailTemplate = applyEmailTemplate;
export const buildTicketTemplateContext = ({ staffUser, ticketUser }) =>
  buildEmailTemplateContext({ staffUser, recipient: ticketUser });
export const buildLeadTemplateContext = ({ staffUser, lead }) =>
  buildEmailTemplateContext({ staffUser, recipient: lead });
