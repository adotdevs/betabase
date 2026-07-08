const cloudinary = require("cloudinary").v2;

/**
 * Cloudinary stores PDFs as image assets. Free accounts may block direct PDF
 * delivery — use pg_N + .jpg URLs to render pages as images instead.
 * @see https://cloudinary.com/documentation/paged_and_layered_media
 * @see https://cloudinary.com/documentation/upload_parameters#uploading_pdfs
 */
function parseCloudinaryUrl(url) {
  if (!url || typeof url !== "string") {
    return null;
  }

  const cleanUrl = url.split("?")[0].split("#")[0];
  const match = cleanUrl.match(
    /^https:\/\/res\.cloudinary\.com\/([^/]+)\/(image|raw)\/upload\/(.+)$/i
  );

  if (!match) {
    return null;
  }

  const [, cloudName, resourceType, remainder] = match;
  const isPdf = /\.pdf$/i.test(remainder) || resourceType === "raw";
  const pathWithoutExt = remainder.replace(/\.pdf$/i, "");

  let version = null;
  let publicId = pathWithoutExt;

  const versionMatch = pathWithoutExt.match(/^(v\d+)\/(.+)$/);
  if (versionMatch) {
    version = parseInt(versionMatch[1].slice(1), 10);
    publicId = versionMatch[2];
  }

  return {
    cloudName,
    resourceType,
    version,
    publicId,
    isPdf,
  };
}

function isCloudinaryPdfUrl(url) {
  if (typeof url !== "string") {
    return false;
  }

  const lower = url.toLowerCase();
  return lower.includes(".pdf") || lower.includes("/raw/upload/");
}

function getCloudinaryPdfDeliveryUrl(storedUrl) {
  if (!storedUrl) {
    return storedUrl;
  }

  const cleanUrl = storedUrl.split("?")[0].split("#")[0];

  if (
    (cleanUrl.includes("/image/upload/") || cleanUrl.includes("/raw/upload/")) &&
    !cleanUrl.toLowerCase().endsWith(".pdf")
  ) {
    return `${cleanUrl}.pdf`;
  }

  return cleanUrl;
}

function buildPdfPageImageUrl(storedUrl, page = 1, width = 800) {
  const cleanUrl = storedUrl.split("?")[0].split("#")[0];
  const [prefix, suffix] = cleanUrl.split("/image/upload/");

  if (!prefix || !suffix) {
    return null;
  }

  const pathPart = suffix.replace(/\.pdf$/i, "");
  const transforms = width
    ? `pg_${page},w_${width},c_limit`
    : `pg_${page}`;

  return `${prefix}/image/upload/${transforms}/${pathPart}.jpg`;
}

function isPdfBuffer(buffer) {
  return (
    buffer &&
    buffer.length > 4 &&
    buffer.subarray(0, 5).toString("utf8") === "%PDF-"
  );
}

async function fetchCloudinaryPdfBuffer(storedUrl) {
  const parsed = parseCloudinaryUrl(storedUrl);
  if (!parsed) {
    return null;
  }

  const signedDownloadUrl = cloudinary.utils.private_download_url(
    parsed.publicId,
    "pdf",
    {
      resource_type: parsed.resourceType,
      type: "upload",
      attachment: false,
    }
  );

  try {
    const signedResponse = await fetch(signedDownloadUrl);
    if (signedResponse.ok) {
      const buffer = Buffer.from(await signedResponse.arrayBuffer());
      if (isPdfBuffer(buffer)) {
        return { buffer, contentType: "application/pdf" };
      }
    }
  } catch (error) {
    // Fall through to CDN delivery attempt.
  }

  const pdfUrl = getCloudinaryPdfDeliveryUrl(storedUrl);

  try {
    const cdnResponse = await fetch(pdfUrl);
    if (cdnResponse.ok) {
      const buffer = Buffer.from(await cdnResponse.arrayBuffer());
      if (isPdfBuffer(buffer)) {
        return { buffer, contentType: "application/pdf" };
      }
    }
  } catch (error) {
    // No PDF source available.
  }

  return null;
}

function getKycDocumentViewUrls(storedUrl) {
  const parsed = parseCloudinaryUrl(storedUrl);
  const pdfUrl = getCloudinaryPdfDeliveryUrl(storedUrl);

  if (!parsed) {
    return {
      pdfUrl,
      previewUrl: null,
      openUrl: null,
      canPreviewAsImage: false,
      isRaw: false,
      isPdf: isCloudinaryPdfUrl(storedUrl),
    };
  }

  if (parsed.resourceType === "image") {
    const baseOptions = {
      secure: true,
      resource_type: "image",
      ...(parsed.version ? { version: parsed.version } : {}),
    };

    const sdkPdfUrl = cloudinary.url(parsed.publicId, {
      ...baseOptions,
      format: "pdf",
    });

    const sdkPreviewUrl = sdkPdfUrl;

    return {
      pdfUrl: sdkPdfUrl,
      previewUrl: sdkPreviewUrl,
      openUrl: sdkPdfUrl,
      canPreviewAsImage: false,
      isRaw: false,
      isPdf: true,
    };
  }

  return {
    pdfUrl,
    previewUrl: null,
    openUrl: null,
    canPreviewAsImage: false,
    isRaw: true,
    isPdf: true,
  };
}

module.exports = {
  parseCloudinaryUrl,
  isCloudinaryPdfUrl,
  getCloudinaryPdfDeliveryUrl,
  buildPdfPageImageUrl,
  getKycDocumentViewUrls,
  fetchCloudinaryPdfBuffer,
};
