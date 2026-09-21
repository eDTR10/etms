export interface QuickLink {
  id: number;
  title: string;
  description: string;
  url: string;
  icon: string;
  created_at: string;
  can_manage: boolean;
}

export interface QuickLinkInput {
  title: string;
  description: string;
  url: string;
  icon: string;
}
