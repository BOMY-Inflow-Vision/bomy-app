import { randomUUID } from "node:crypto"

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

let _s3: S3Client | null = null

function getS3(): S3Client {
  if (!_s3) {
    const endpoint = process.env["S3_ENDPOINT"]
    const accessKeyId = process.env["S3_ACCESS_KEY"]
    const secretAccessKey = process.env["S3_SECRET_KEY"]
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error("S3_ENDPOINT, S3_ACCESS_KEY, and S3_SECRET_KEY are required")
    }
    _s3 = new S3Client({
      endpoint,
      region: "auto",
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    })
  }
  return _s3
}

export async function createPresignedPutUrl(
  contentType: string,
  contentLength: number,
): Promise<{ url: string; key: string }> {
  const bucket = process.env["S3_BUCKET"]
  if (!bucket) throw new Error("S3_BUCKET is required")

  const MIME_TO_EXT: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
  }
  const ext = MIME_TO_EXT[contentType]
  if (!ext) throw new Error("Unsupported content type")
  const key = `products/${randomUUID()}.${ext}`

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  })
  const url = await getSignedUrl(getS3(), command, { expiresIn: 300 })
  return { url, key }
}

export function buildPublicUrl(key: string): string {
  const base = process.env["S3_PUBLIC_URL"]
  if (!base) throw new Error("S3_PUBLIC_URL is required")
  return `${base.replace(/\/$/, "")}/${key}`
}
