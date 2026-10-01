interface LifecycleAdapter { start(root: string): void; dispose(): void }
interface QuestionAdapter { start(): void; dispose(): void }

/** Owns optional PAN adapters; disabled windows never create a PAN subscriber. */
export class PanIntegration {
  private lifecycle?: LifecycleAdapter;
  private questions?: QuestionAdapter;

  constructor(private readonly createLifecycle: () => LifecycleAdapter,
              private readonly createQuestions: () => QuestionAdapter) {}

  sync(enabled: boolean, ready: boolean, root: string): void {
    this.dispose();
    if (!enabled || !ready) return;
    this.lifecycle = this.createLifecycle();
    this.questions = this.createQuestions();
    this.lifecycle.start(root);
    this.questions.start();
  }

  dispose(): void {
    this.lifecycle?.dispose();
    this.questions?.dispose();
    this.lifecycle = undefined;
    this.questions = undefined;
  }
}
