import { TextChannel, Message, Attachment } from "discord.js";

export async function getMessagesWithVideos(channel: TextChannel): Promise<Message[]> {
  const messages = await channel.messages.fetch();
  const filteredMessages = messages.filter((message) => {
    return message.attachments.some((attachment) => {
      return attachment.contentType?.startsWith('video/') ?? false;
    });
  });

  return Array.from(filteredMessages.values());
}

export function extractVideoURLs(message: Message): string[] {
  return [...message.attachments.values()].filter((a: Attachment) => a.contentType?.startsWith('video/') ?? false).map((a: Attachment) => a.url);
}