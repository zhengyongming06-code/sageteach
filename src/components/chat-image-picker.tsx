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

export type PendingChatImage = {
  file: File;
  previewUrl: string;
};

type ChatImageAttachButtonProps = {
  onImageSelected: (image: PendingChatImage) => void;
  disabled?: boolean;
  className?: string;
};

const ACCEPT = "image/jpeg,image/png,image/webp,image/bmp";

export function revokePendingChatImage(image: PendingChatImage | null) {
  if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
}

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
    <div className={cn("px-4 pt-2", className)}>
      <div className="relative inline-flex w-fit max-w-full">
        <img
          src={image.previewUrl}
          alt="待发送的题目图片"
          className="max-h-24 max-w-[200px] rounded-xl border border-border object-cover"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={onClear}
          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:bg-muted"
          aria-label="移除图片"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function ChatImageAttachButton({
  onImageSelected,
  disabled = false,
  className,
}: ChatImageAttachButtonProps) {
  const cameraInputId = useId();
  const albumInputId = useId();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file || !file.type.startsWith("image/")) return;
      const previewUrl = URL.createObjectURL(file);
      onImageSelected({ file, previewUrl });
    },
    [onImageSelected],
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
        disabled={disabled}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={albumInputRef}
        id={albumInputId}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
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
