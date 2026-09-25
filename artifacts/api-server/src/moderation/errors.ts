export class ModerationRevisionConflictError extends Error {
  constructor() {
    super("Moderation configuration has changed; refresh before saving.");
  }
}