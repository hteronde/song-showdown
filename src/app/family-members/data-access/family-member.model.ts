export interface FamilyMember {
  id: string;
  name: string;
  initials: string;
  color: string;
}

export interface FamilyMemberRecord {
  userId: number;
  familyId: number;
  displayName: string;
  email: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

export interface FamilyMemberInput {
  displayName: string;
  email: string;
  role: 'owner' | 'member';
}
