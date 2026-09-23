import { useState } from "react";
import { BookOpen } from "lucide-react";

export function BookCover({ title, coverUrl }: { title: string; coverUrl?: string }) {
  // Remember which url failed rather than that one did, so a card that fell
  // back once still retries when the catalog points somewhere new.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!coverUrl || failedUrl === coverUrl) {
    return (
      <div className="book-cover-fallback">
        <BookOpen className="size-8" />
        <span>{title}</span>
      </div>
    );
  }

  return (
    <img
      src={coverUrl}
      alt={`${title} cover`}
      className="book-cover-image"
      loading="lazy"
      onError={() => setFailedUrl(coverUrl)}
    />
  );
}
