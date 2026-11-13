export interface SampleFile {
  id: string;
  name: string;
  format: string;
  size: string;
  date: string;
  status: string;
  assets: number;
}
export const sampleFiles: SampleFile[] = [
  {
    id: "network",
    name: "5G Network Architecture — Technical Deep Dive.mp4",
    format: "MP4",
    size: "1.24 GB",
    date: "Nov 13, 2026",
    status: "Completed",
    assets: 48,
  },
  {
    id: "strategy",
    name: "AI-native Networks Strategy.pptx",
    format: "PPTX",
    size: "24.8 MB",
    date: "Nov 13, 2026",
    status: "Completed",
    assets: 32,
  },
  {
    id: "training",
    name: "Cloud RAN Training Session.mp4",
    format: "MP4",
    size: "862 MB",
    date: "Nov 12, 2026",
    status: "Awaiting Review",
    assets: 64,
  },
  {
    id: "guide",
    name: "Network Slicing — Implementation Guide.pdf",
    format: "PDF",
    size: "12.6 MB",
    date: "Nov 12, 2026",
    status: "Completed",
    assets: 24,
  },
  {
    id: "roadmap",
    name: "Technology Roadmap Q4 2026.pptx",
    format: "PPTX",
    size: "18.2 MB",
    date: "Nov 11, 2026",
    status: "Completed",
    assets: 28,
  },
];
export const segments = [
  {
    id: 1,
    start: 12,
    end: 154,
    speaker: "Speaker 1",
    slide: 1,
    title: "The connected future",
    text: "Welcome everyone. Today we will explore how 5G network architecture connects people, industries, and intelligent systems.",
  },
  {
    id: 2,
    start: 155,
    end: 347,
    speaker: "Speaker 2",
    slide: 2,
    title: "5G network architecture",
    text: "The architecture separates the radio access network from the core. Cloud-native functions let us scale each network component independently.",
  },
  {
    id: 3,
    start: 348,
    end: 485,
    speaker: "Speaker 1",
    slide: 3,
    title: "Network slicing",
    text: "Network slicing creates dedicated logical networks on shared infrastructure. Each slice can meet different latency, reliability, and capacity requirements.",
  },
  {
    id: 4,
    start: 486,
    end: 622,
    speaker: "Speaker 2",
    slide: 4,
    title: "AI-native operations",
    text: "AI-native networks use intelligence throughout the architecture to predict demand, optimize energy consumption, and improve service quality.",
  },
] as const;
export const stamp = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
export function storageSavings(original: number, retained: number) {
  const savings = original - retained;
  return { savings, percentage: original > 0 ? (savings / original) * 100 : 0 };
}
export function validateFile(name: string, size: number) {
  if (!/\.(mp4|mov|mkv|avi|pdf|pptx|docx)$/i.test(name)) return "Unsupported file format";
  if (size > 50 * 1024 * 1024) return "The current secure upload limit is 50 MB";
  if (size === 0) return "The file is empty";
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
