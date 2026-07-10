import { useCallback, useId, useRef } from "react";
import { Camera, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const MAX_PENDING_CHAT_IMAGES = 4;

export type PendingChatImage = {
  id: string;
  file: File;
  previewUrl: string;
};

type ChatImageAttachButtonProps = {
  onImagesSelected: (images: PendingChatImage[]) => void;
  disabled?: boolean;
  remainingSlots?: number;
  className?: string;
};

const ACCEPT = "image/jpeg,image/png,image/webp,image/bmp";

export function createPendingChatImage(file: File): PendingChatImage {
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file),
  };
}

export function revokePendingChatImage(image: PendingChatImage | null | undefined) {
  if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
}

export function revokePendingChatImages(images: PendingChatImage[]) {
  for (const image of images) revokePendingChatImage(image);
}

export function ChatImagePreviewStrip({
  images,
  onRemove,
  disabled,
  className,
}: {
  images: PendingChatImage[];
  onRemove: (id: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  if (images.length === 0) return null;

  return (
    <div className={cn("chat-image-preview-strip", className)}>
      {images.map((image, index) => (
        <div key={image.id} className="chat-image-preview-item">
          <img
            src={image.previewUrl}
            alt={`待发送题目图片 ${index + 1}`}
            className="chat-image-preview-thumb"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(image.id)}
            className="chat-image-preview-remove"
            aria-label={`移除第 ${index + 1} 张图片`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** @deprecated Use ChatImagePreviewStrip */
export function ChatImagePreview({
  image,
  onClear,
  disabled,
  className,
}: {
  image: PendingChatImage;
  onClear: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <ChatImagePreviewStrip
      images={[image]}
      onRemove={() => onClear()}
      disabled={disabled}
      className={className}
    />
  );
}

export function ChatImageAttachButton({
  onImagesSelected,
  disabled = false,
  remainingSlots = MAX_PENDING_CHAT_IMAGES,
  className,
}: ChatImageAttachButtonProps) {
  const cameraInputId = useId();
  const albumInputId = useId();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);
  const pickerDisabled = disabled || remainingSlots <= 0;

  const handleFiles = useCallback(
    (fileList: FileList | null | undefined) => {
      if (!fileList?.length || remainingSlots <= 0) return;
      const picked = Array.from(fileList)
        .filter((file) => file.type.startsWith("image/"))
        .slice(0, remainingSlots)
        .map((file) => createPendingChatImage(file));
      if (picked.length === 0) return;
      onImagesSelected(picked);
    },
    [onImagesSelected, remainingSlots],
  );

  return (
    <>
      <input
        ref={cameraInputRef}
        id={cameraInputId}
        type="file"
        accept={ACCEPT}
        capture="environment"
        className="sr-only"
        disabled={pickerDisabled}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={albumInputRef}
        id={albumInputId}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        disabled={pickerDisabled}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={pickerDisabled}
            className={cn(
              "shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground",
              className,
            )}
            aria-label="添加题目图片"
          >
            <Camera className="h-5 w-5" strokeWidth={1.75} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="min-w-[10rem]">
          <DropdownMenuItem onSelect={() => cameraInputRef.current?.click()}>
            拍照
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => albumInputRef.current?.click()}>
            从相册选择
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
