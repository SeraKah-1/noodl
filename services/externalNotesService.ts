/** External notes bridge — disabled in public Noodl (was Firebase-specific). */
export type ExternalNote = { id: string; title: string; content: string };
export const externalAuth = { currentUser: null as any };
export const isExternalConfigured = () => false;
export async function loginToExternalNotes() { throw new Error("External notes not configured in this build."); }
export async function logoutFromExternalNotes() {}
export async function getMyNotes(): Promise<ExternalNote[]> { return []; }
