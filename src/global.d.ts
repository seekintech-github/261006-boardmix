export {};
declare global {
  interface Window {
    desktop?: {
      saveFile(options: {
        name: string;
        content: string;
        encoding?: 'utf8' | 'base64';
        filters?: { name: string; extensions: string[] }[];
      }): Promise<{ saved: boolean; path?: string }>;
      openFile(): Promise<{ name: string; content: string } | null>;
    };
  }
}
