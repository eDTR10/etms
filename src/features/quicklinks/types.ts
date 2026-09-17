export interface QuickLink {
  id: number;
  title: string;
  description: string;
  url: string;
  icon: string;
  created_at: string;
}

export interface QuickLinkInput {
  title: string;
  description: string;
  url: string;
  icon: string;
}
