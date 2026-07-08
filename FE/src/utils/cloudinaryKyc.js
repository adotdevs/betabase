export function isCloudinaryPdfUrl(url) {
  if (typeof url !== "string") {
    return false;
  }

  const lower = url.toLowerCase();
  return lower.includes(".pdf") || lower.includes("/raw/upload/");
}

/** Cloudinary pg_1 JPG — works when direct PDF CDN delivery is blocked. */
export function getKycDocumentPreviewUrl(storedUrl, width = 600) {
  if (!storedUrl || !isCloudinaryPdfUrl(storedUrl)) {
    return null;
  }

  const cleanUrl = storedUrl.split("?")[0].split("#")[0];

  if (!cleanUrl.includes("/image/upload/")) {
    return null;
  }

  const [prefix, suffix] = cleanUrl.split("/image/upload/");
  if (!prefix || !suffix) {
    return null;
  }

  const pathPart = suffix.replace(/\.pdf$/i, "");
  return `${prefix}/image/upload/pg_1,w_${width},c_limit/${pathPart}.jpg`;
}

export function getKycDocumentViewUrls(storedUrl) {
  const previewUrl = getKycDocumentPreviewUrl(storedUrl);

  return {
    previewUrl,
    canPreviewAsImage: Boolean(previewUrl),
    isPdf: isCloudinaryPdfUrl(storedUrl),
  };
}
