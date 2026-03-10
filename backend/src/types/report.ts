export interface Report {
  id: string;
  venueId: string;
  reporterId: string | null;
  reportType: string;
  status: 'submitted' | 'reviewed' | 'resolved' | 'rejected' | string;
  notes: string | null;
  reportData: Record<string, unknown>;
  reportedAt: string;
  createdAt: string;
  updatedAt: string;
}
