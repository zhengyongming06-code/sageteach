import { memo, useCallback, useImperativeHandle, useState, forwardRef, type Ref } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ChatImageAttachButton,
  ChatImagePreview,
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
  pendingImage?: PendingChatImage | null;
  onImageSelected?: (image: PendingChatImage) => void;
  onClearImage?: () => void;
  onOptimisticSend?: (payload: { text: string; previewUrl?: string }) => void;
};

export const SageChatComposer = memo(
  forwardRef(function SageChatComposer(
    {
      onSubmit,
      isSending,
      placeholder,
      isMobile,
      pendingImage = null,
      onImageSelected,
      onClearImage,
      onOptimisticSend,
    }: SageChatComposerProps,
    ref: Ref<SageChatComposerHandle>,
  ) {
    const [inputValue, setInputValue] = useState("");

    useImperativeHandle(ref, () => ({
      setInputValue,
      clearInput: () => setInputValue(""),
    }));

    const canSubmit = Boolean(inputValue.trim() || pendingImage) && !isSending;
    const imagePickerEnabled = Boolean(onImageSelected && onClearImage);

    const handleSubmit = useCallback(() => {
      const text = inputValue.trim();
      const displayText = text || (pendingImage ? "请帮我分析这道题目" : "");
      if (!displayText || isSending) return;

      onOptimisticSend?.({ text, previewUrl: pendingImage?.previewUrl });
      setInputValue("");
      onSubmit(text);
    }, [inputValue, isSending, onOptimisticSend, onSubmit, pendingImage]);

    if (isMobile) {
      return (
        <form
          className="flex shrink-0 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          {pendingImage && onClearImage ? (
            <ChatImagePreview
              image={pendingImage}
              onClear={onClearImage}
              disabled={isSending}
              className="border-b border-border/60 pb-2"
            />
          ) : null}
          <div className="flex h-[52px] items-center gap-1 px-4 py-[10px]">
            {imagePickerEnabled ? (
              <ChatImageAttachButton
                onImageSelected={onImageSelected!}
                disabled={isSending}
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
        {pendingImage && onClearImage ? (
          <ChatImagePreview
            image={pendingImage}
            onClear={onClearImage}
            disabled={isSending}
            className="px-0"
          />
        ) : null}
        <form
          className="safe-bottom flex shrink-0 items-end gap-2 pb-1 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          {imagePickerEnabled ? (
            <ChatImageAttachButton
              onImageSelected={onImageSelected!}
              disabled={isSending}
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
