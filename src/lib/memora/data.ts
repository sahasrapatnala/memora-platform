import { MAX_ORIGINAL_BYTES } from "./upload-rules";

export const stamp = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
export function storageSavings(original: number, retained: number) {
  const savings = original - retained;
  return { savings, percentage: original > 0 ? (savings / original) * 100 : 0 };
}
export function validateFile(name: string, size: number) {
  if (!/\.(mp4|mov|pdf|pptx|docx)$/i.test(name)) return "Unsupported file format";
  if (!Number.isSafeInteger(size) || size > MAX_ORIGINAL_BYTES) return "The current secure upload limit is 2 GB";
  if (size <= 0) return "The file is empty";
  return null;
}
export const pageMeta = (title: string, description: string) => ({
  meta: [
    { title: `${title} | MEMORA` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} | MEMORA` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ],
});
