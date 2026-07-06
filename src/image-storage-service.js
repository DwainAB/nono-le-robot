import { v2 as cloudinary } from "cloudinary";
import { config } from "./config.js";

let configured = false;

export function isImageStorageConfigured() {
  return Boolean(config.cloudinaryCloudName && config.cloudinaryApiKey && config.cloudinaryApiSecret);
}

function ensureConfigured() {
  if (configured) {
    return;
  }

  cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret,
    secure: true
  });
  configured = true;
}

export async function uploadProductImage({ buffer, mimeType }) {
  if (!isImageStorageConfigured()) {
    throw new Error("Stockage d'images non configure");
  }

  if (!buffer || !buffer.length) {
    throw new Error("Fichier image vide");
  }

  ensureConfigured();

  const allowedMimeTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
  if (mimeType && !allowedMimeTypes.has(mimeType)) {
    throw new Error("Format d'image non supporte");
  }

  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: config.cloudinaryFolder,
        resource_type: "image"
      },
      (error, uploadResult) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(uploadResult);
      }
    );
    uploadStream.end(buffer);
  });

  return {
    key: result.public_id,
    url: result.secure_url
  };
}

export async function deleteProductImage(publicId) {
  if (!isImageStorageConfigured() || !publicId) {
    return;
  }

  ensureConfigured();
  await cloudinary.uploader.destroy(publicId);
}