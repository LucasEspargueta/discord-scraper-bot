export class VideoInfo {
    messageUrl: string;
    videoUrl: string;
    uploadDate: Date;

    constructor(messageUrl: string, videoUrl: string, uploadDate: Date) {
        this.messageUrl = messageUrl;
        this.videoUrl = videoUrl;
        this.uploadDate = uploadDate;
    }

    public getUniqueVideoIdentifier(): string {
        return VideoInfo.getUniqueVideoIdentifier(this.videoUrl);
    }

    public static getUniqueVideoIdentifier(videoUrl: string): string {
        const regex = /(?<id>.*)\&hm\=.*/;
        const match = regex.exec(videoUrl)!;
        
        return match.groups?.id!;
    }
}