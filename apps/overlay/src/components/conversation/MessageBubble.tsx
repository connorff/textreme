import { useEffect, useState } from "react";
import type { ConversationMessage } from "../../types/electron";

interface MessageBubbleProps {
  message: ConversationMessage;
  isFromMe: boolean;
}

export const MessageBubble = ({ message, isFromMe }: MessageBubbleProps) => {
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [visibleImages, setVisibleImages] = useState<number>(0);

  useEffect(() => {
    const load = async () => {
      const attachments = message.attachments || [];
      if (attachments.length > 0) {
        console.log(
          `[Attachments] message ${message.id} has ${attachments.length} attachment(s)`
        );
      }
      const images = attachments.filter(
        (a) =>
          !!a &&
          !!a.filename &&
          (a.mime_type?.toLowerCase().startsWith("image/") ||
            a.uti?.toLowerCase().includes("image"))
      );
      const urls: string[] = [];
      for (const a of images) {
        // Prefer data URL to avoid local resource restrictions in http renderer
        const dataUrl = await window.electronAPI.readFileAsDataUrl(
          a.filename!,
          a.mime_type || undefined
        );
        if (dataUrl) {
          console.log(
            `[Attachments] resolved data url for ${a.filename}: length=${dataUrl.length}`
          );
          urls.push(dataUrl);
        } else {
          const fileUrl = await window.electronAPI.resolveFileUrl(a.filename!);
          console.log(
            `[Attachments] fallback file url for ${a.filename}: ${fileUrl ?? "null"}`
          );
          if (fileUrl) urls.push(fileUrl);
        }
      }
      setImageUrls(urls);
      setVisibleImages(urls.length);
    };
    load();
  }, [message.attachments]);

  const renderImages = () =>
    imageUrls.map((src, idx) => (
      <img
        key={idx}
        src={src}
        alt="Image"
        className="rounded-lg max-w-[240px] h-auto"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
          setVisibleImages((c) => Math.max(0, c - 1));
          console.warn("[Attachments] image failed to load:", src);
        }}
        onLoad={() => {
          console.log("[Attachments] image loaded:", src);
        }}
      />
    ));

  // Treat OBJECT REPLACEMENT and other invisible chars as empty (common for media-only messages)
  const sanitizedText = (message.text ?? "")
    .replace(/[\uFFFC\uFEFF\u200B\u200C\u200D\u2060]/g, "")
    .trim();
  const hasText = sanitizedText.length > 0;
  const hasImages = imageUrls.length > 0;
  const attachments = message.attachments || [];

  // If the content is images only, render without bubble styling
  const hasImagesOnly = !hasText && hasImages;

  if (hasImagesOnly) {
    return (
      <div className="flex flex-col gap-1">{renderImages()}</div>
    );
  }

  // Text + images: bubble for text, images below (no bubble)
  if (hasText && hasImages) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-col gap-1">{renderImages()}</div>
        <div
          className={`rounded-2xl px-3 py-1.5 text-xs max-w-full break-words min-w-0 ${
            isFromMe ? "bg-blue-500 text-white" : "bg-gray-100 text-foreground"
          }`}
          style={{
            borderRadius: isFromMe
              ? "18px 4px 18px 18px"
              : "4px 18px 18px 18px",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
            hyphens: "auto",
          }}
        >
          {sanitizedText}
        </div>
      </div>
    );
  }

  // Text (or non-image placeholders) in standard bubble
  return (
    <div
      className={`rounded-2xl px-3 py-1.5 text-xs max-w-full break-words min-w-0 ${
        isFromMe ? "bg-blue-500 text-white" : "bg-gray-100 text-foreground"
      }`}
      style={{
        borderRadius: isFromMe
          ? "18px 4px 18px 18px"
          : "4px 18px 18px 18px",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
        hyphens: "auto",
      }}
    >
      {hasText ? (
        sanitizedText
      ) : attachments.length > 0 ? (
        <span className="text-[11px] opacity-80">
          {attachments[0].is_sticker
            ? "[Sticker]"
            : (attachments[0].mime_type || attachments[0].uti || "")
                .toLowerCase()
                .startsWith("image/")
            ? "[Image loading…]"
            : (attachments[0].mime_type || attachments[0].uti || "")
                .toLowerCase()
                .startsWith("video/")
            ? "[Video]"
            : (attachments[0].mime_type || attachments[0].uti || "")
                .toLowerCase()
                .startsWith("audio/")
            ? "[Audio]"
            : (attachments[0].mime_type || attachments[0].uti || "")
                .toLowerCase()
                .includes("pdf")
            ? "[PDF]"
            : (attachments[0].mime_type || attachments[0].uti || "")
                .toLowerCase()
                .includes("zip")
            ? "[Archive]"
            : "[Attachment]"}
        </span>
      ) : (
        "[Unsupported message]"
      )}
    </div>
  );
};

