export class PreviewUrl {
  private url?: string;

  set(blob: Blob): string {
    this.clear();
    this.url = URL.createObjectURL(blob);
    return this.url;
  }

  clear(): void {
    if (!this.url) return;
    URL.revokeObjectURL(this.url);
    this.url = undefined;
  }
}
