import { memo, useCallback, useImperativeHandle, useState, forwardRef, type Ref } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ChatImageAttachButton,
  ChatImagePreviewStrip,
  MAX_PENDING_CHAT_IMAGES,
  type PendingChatImage,
} from "@/components/chat-image-picker";

export type SageChatComposerHandle = {
  setInputValue: (value: string) => void;
  clearInput: () => void;
};

function SendArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 14V2M8 2L3 7M8 2L13 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type SageChatComposerProps = {
  onSubmit: (text: string) => void;
  isSending: boolean;
  placeholder: string;
  isMobile: boolean;
  pendingImages?: PendingChatImage[];
  onImagesSelected?: (images: PendingChatImage[]) => void;
  onRemoveImage?: (id: string) => void;
  onOptimisticSend?: (payload: { text: string; previewUrl?: string }) => void;
};

export const SageChatComposer = memo(
  forwardRef(function SageChatComposer(
    {
      onSubmit,
      isSending,
      placeholder,
      isMobile,
      pendingImages = [],
      onImagesSelected,
      onRemoveImage,
      onOptimisticSend,
    }: SageChatComposerProps,
    ref: Ref<SageChatComposerHandle>,
  ) {
    const [inputValue, setInputValue] = useState("");

    useImperativeHandle(ref, () => ({
      setInputValue,
      clearInput: () => setInputValue(""),
    }));

    const hasImages = pendingImages.length > 0;
    const canSubmit = Boolean(inputValue.trim() || hasImages) && !isSending;
    const imagePickerEnabled = Boolean(onImagesSelected && onRemoveImage);
    const remainingSlots = MAX_PENDING_CHAT_IMAGES - pendingImages.length;

    const handleSubmit = useCallback(() => {
      const text = inputValue.trim();
      const displayText =
        text || (hasImages ? (pendingImages.length > 1 ? "请帮我分析这些题目" : "请帮我分析这道题目") : "");
      if (!displayText || isSending) return;

      onOptimisticSend?.({ text, previewUrl: pendingImages[0]?.previewUrl });
      setInputValue("");
      onSubmit(text);
    }, [hasImages, inputValue, isSending, onOptimisticSend, onSubmit, pendingImages]);

    const previewStrip =
      hasImages && onRemoveImage ? (
        <ChatImagePreviewStrip
          images={pendingImages}
          onRemove={onRemoveImage}
          disabled={isSending}
        />
      ) : null;

    if (isMobile) {
      return (
        <form
          className="chat-composer-mobile flex shrink-0 flex-col border-t border-border/70 bg-background"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          {previewStrip}
          <div className="flex h-[52px] items-center gap-1 px-4 py-[10px]">
            {imagePickerEnabled ? (
              <ChatImageAttachButton
                onImagesSelected={onImagesSelected!}
                disabled={isSending}
                remainingSlots={remainingSlots}
                className="h-9 w-9 shrink-0"
              />
            ) : null}
            <div className="relative flex min-w-0 flex-1 items-center">
              <Textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder={placeholder}
                rows={1}
                className={cn(
                  "min-h-0 h-9 w-full resize-none rounded-[24px] border border-border bg-white py-2 pr-12 text-base leading-5",
                  imagePickerEnabled ? "pl-3" : "pl-4",
                )}
              />
              <Button
                type="submit"
                disabled={!canSubmit}
                size="icon"
                className="wiki-user-bubble absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full hover:opacity-90"
              >
                <SendArrowIcon />
              </Button>
            </div>
          </div>
        </form>
      );
    }

    return (
      <>
        {previewStrip}
        <form
          className="safe-bottom flex shrink-0 items-end gap-2 pb-1 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          {imagePickerEnabled ? (
            <ChatImageAttachButton
              onImagesSelected={onImagesSelected!}
              disabled={isSending}
              remainingSlots={remainingSlots}
              className="h-12 w-12 shrink-0"
            />
          ) : null}
          <Textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={placeholder}
            className="min-h-12 flex-1 resize-none rounded-xl border-border bg-card"
          />
          <Button type="submit" disabled={!canSubmit} size="icon" className="h-12 w-12 shrink-0 rounded-xl">
            <SendArrowIcon />
          </Button>
        </form>
      </>
    );
  }),
);
