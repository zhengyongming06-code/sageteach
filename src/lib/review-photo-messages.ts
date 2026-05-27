/** Stored in coach_messages.content when the user message is image-only. */
export const SAGE_PHOTO_MESSAGE_MARKER = "__sage_photo_v1__";

export const PHOTO_UPLOADED_LABEL = "📷 图片（已上传）";

export function isPhotoOnlyMessageContent(content: string): boolean {
  return content.trim() === SAGE_PHOTO_MESSAGE_MARKER;
}

type PhotoMessageLike = {
  content: string;
  imageUrl?: string;
  photoUploaded?: boolean;
};

/** Persisted / cached messages must not carry base64 image URLs. */
export function stripPhotoImageFromMessage<T extends PhotoMessageLike>(msg: T): T {
  if (!isPhotoOnlyMessageContent(msg.content) && !msg.photoUploaded) {
    return msg;
  }
  return {
    ...msg,
    imageUrl: undefined,
    photoUploaded: true,
  };
}

export function stripPhotoImagesFromMessages<T extends PhotoMessageLike>(messages: T[]): T[] {
  return messages.map(stripPhotoImageFromMessage);
}
