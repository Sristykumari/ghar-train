import type { Metadata } from "next";
import { ApiDocsView } from "@/components/api-docs/api-docs-view";

export const metadata: Metadata = { title: "Ghar Train API" };

export default function ApiDocsPage() {
  return <ApiDocsView />;
}
