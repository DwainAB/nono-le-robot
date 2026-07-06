import crypto from "node:crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { config } from "./config.js";

let s3ClientInstance = null;

export function isImageStorageConfigured() {
  return Boolean(
    config.storageEndpoint && config.storageBucket && config.storageAccessKeyId && config.storageSecretAccessKey
  );
}

function getS3Client() {
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      endpoint: config.storageEndpoint,
      region: config.storageRegion || "auto",
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.storageAccessKeyId,
        secretAccessKey: config.storageSecretAccessKey
      }
    });
  }
  return s3ClientInstance;
}

function buildPublicUrl(key) {
  const base = config.storagePublicUrlBase || `${config.storageEndpoint}/${config.storageBucket}`;
  return `${base.replace(/\/+$/, "")}/${key}`;
}

function extensionFromMimeType(mimeType) {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/jpeg":
    case "image/jpg":
    default:
      return "jpg";
  }
}

export async function uploadProductImage({ buffer, mimeType }) {
  if (!isImageStorageConfigured()) {
    throw new Error("Stockage d'images non configure");
  }

  if (!buffer || !buffer.length) {
    throw new Error("Fichier image vide");
  }

  const allowedMimeTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
  const resolvedMimeType = allowedMimeTypes.has(mimeType) ? mimeType : "image/jpeg";
  const key = `products/${Date.now()}-${crypto.randomUUID()}.${extensionFromMimeType(resolvedMimeType)}`;

  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: config.storageBucket,
      Key: key,
      Body: buffer,
      ContentType: resolvedMimeType
    })
  );

  return {
    key,
    url: buildPublicUrl(key)
  };
}

export async function deleteProductImage(key) {
  if (!isImageStorageConfigured() || !key) {
    return;
  }

  const client = getS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.storageBucket,
      Key: key
    })
  );
}