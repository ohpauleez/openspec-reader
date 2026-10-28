import browser from 'webextension-polyfill';
import { button, element } from '../dom';
import { NativeProvider, ProviderError } from './provider';
import type { AnalysisProvider } from './provider';
import type { EngineResult, ModelLaunch } from './types';

export interface ExecutionSnapshot { readonly payload: Record<string, unknown>; readonly launch: ModelLaunch | null; readonly selected: readonly string[] }

/** Local execution is optional; the panel owns exactly one native session and captured model snapshot. */
export class AnalysisPanel {
  readonly root = element('section', 'analysis-panel');
  readonly status = element('p', 'status', 'Import an Analyzer XML result, or connect an optional local Alloy 6 installation.');
  readonly commands = element('select');
  readonly jar = element('input');
  readonly project = element('input');
  readonly timeout = element('input');
  readonly solver = element('input');
  private readonly provider: AnalysisProvider;
  private connected = false;
  private loaded = false;
  private sat = false;
  private incremental = false;
  private temporal = false;
  private busy = false;
  private epoch = 0;
  private snapshot: ExecutionSnapshot | null = null;
  private readonly connectButton: HTMLButtonElement;
  private readonly loadButton: HTMLButtonElement;
  private readonly runButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly forkButton: HTMLButtonElement;
  private readonly mode = element('select');
  private readonly cancelButton: HTMLButtonElement;

  constructor(private readonly source: () => ExecutionSnapshot, private readonly state: () => number, private readonly result: (data: EngineResult, snapshot: ExecutionSnapshot) => void, provider: AnalysisProvider = new NativeProvider()) {
    this.provider = provider;
    this.jar.placeholder = '/path/to/project/alloy-6.jar'; this.jar.setAttribute('aria-label', 'Alloy JAR path');
    this.project.placeholder = 'Optional; defaults to model directory'; this.project.setAttribute('aria-label', 'Module root directory');
    this.timeout.type = 'number'; this.timeout.min = '.1'; this.timeout.max = '300'; this.timeout.value = '30'; this.timeout.setAttribute('aria-label', 'Analysis timeout seconds');
    this.solver.value = 'sat4j'; this.solver.setAttribute('aria-label', 'Alloy solver');
    this.commands.setAttribute('aria-label', 'Alloy command');
    for (const [value, label] of [['-1', 'New configuration'], ['-2', 'New trace, same configuration'], ['0', 'New initial state'], ['current', 'Fork from selected state']]) { const option = element('option', '', label); option.value = value; this.mode.append(option); }
    this.mode.setAttribute('aria-label', 'Trace alternative');
    this.connectButton = button('Connect local Alloy', () => { void this.connect(); });
    this.loadButton = button('Load commands', () => { void this.load(); });
    this.runButton = button('Run / check', () => { void this.run(); });
    this.nextButton = button('Another solution', () => { void this.perform('next'); });
    this.forkButton = button('Generate alternative', () => { void this.perform('fork', { state: this.mode.value === 'current' ? this.state() : Number(this.mode.value) }); });
    this.cancelButton = button('Cancel analysis', () => { this.loaded = false; this.sat = false; void this.provider.request('cancel').catch((error) => { this.status.textContent = String(error); }); });
    this.status.setAttribute('role', 'status');
    const buttons = element('div', 'actions'); buttons.append(this.connectButton, this.loadButton, this.runButton, this.cancelButton);
    const alternatives = element('div', 'actions'); alternatives.append(this.nextButton, this.mode, this.forkButton);
    this.root.append(element('h2', '', 'Optional local analysis'), field('Existing Alloy 6 JAR', this.jar), field('Project module root', this.project), field('Timeout (seconds)', this.timeout), field('Solver', this.solver), buttons, this.commands, alternatives, this.status);
    this.root.append(element('p', 'muted', 'Requires the optional native bridge. Import, playback, graphs and tables work without Java. See native/README.md for installation.'));
    for (const input of [this.jar, this.project, this.solver]) input.addEventListener('change', () => this.invalidate());
    void browser.storage.local.get('alloy-engine-settings').then((saved) => {
      const value = saved['alloy-engine-settings'] as { jar?: unknown; project?: unknown } | undefined;
      if (typeof value?.jar === 'string') this.jar.value = value.jar;
      if (typeof value?.project === 'string') this.project.value = value.project;
    });
    this.update();
  }

  /** Source selection changes invalidate execution controls without destroying displayed evidence. */
  invalidate(): void { this.epoch++; this.loaded = false; this.sat = false; this.update(); }
  get canEvaluate(): boolean { return this.loaded && this.sat && !this.busy; }
  close(): void { this.provider.close(); }

  /** Permission request remains directly inside the Connect button's user gesture. */
  private async connect(): Promise<void> {
    this.busy = true; this.update(); this.status.textContent = 'Connecting to the optional local bridge…';
    try {
      const hello = await this.provider.connect(); this.connected = true; this.invalidate();
      if (!this.jar.value && typeof hello.jarPath === 'string') this.jar.value = hello.jarPath;
      if (!this.project.value && typeof hello.projectRoot === 'string') this.project.value = hello.projectRoot;
      this.status.textContent = 'Local bridge connected. Select a model and load its commands.';
    } catch (error) { this.connected = false; this.status.textContent = `Local engine unavailable: ${String(error)} Import remains available.`; }
    finally { this.busy = false; this.update(); }
  }

  private options(): Record<string, unknown> {
    const timeoutMs = Math.round(Number(this.timeout.value) * 1000);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 300_000) throw new Error('Choose a timeout between 0.1 and 300 seconds');
    return { jarPath: this.jar.value.trim(), projectRoot: this.project.value.trim(), timeoutMs, solver: this.solver.value.trim() || 'sat4j' };
  }
  private async load(): Promise<void> {
    const epoch = this.epoch;
    try {
      this.snapshot = this.source();
      await this.task(async () => {
        const data = await this.provider.request('load', { ...this.snapshot!.payload, ...this.options() });
        this.commands.replaceChildren();
        for (const command of data.commands ?? []) { const option = element('option', '', command.description); option.value = String(command.index); this.commands.append(option); }
        this.loaded = this.epoch === epoch; this.sat = false;
        this.result(data, this.snapshot!);
        this.status.textContent = `Alloy ${data.version} · ${data.commands?.length ?? 0} commands loaded from the captured module bundle.`;
        await browser.storage.local.set({ 'alloy-engine-settings': { jar: this.jar.value, project: this.project.value } });
      });
    } catch (error) { this.status.textContent = String(error); }
  }
  private async run(): Promise<void> { await this.perform('run', { command: Number(this.commands.value) }); }
  private async perform(action: string, payload: Record<string, unknown> = {}): Promise<void> {
    await this.task(async () => {
      const data = await this.provider.request(action, { ...payload, ...this.options() });
      if (data.outcome !== 'exhausted') { this.sat = !!data.xml; this.incremental = !!data.incremental; this.temporal = !!data.temporal; }
      this.result(data, this.snapshot!);
      this.status.textContent = outcomeText(data);
    });
  }
  /** Evaluation refers to a stored trace position, not an inferred causal event or replay loop count. */
  async evaluate(expression: string, state: number): Promise<EngineResult> {
    if (!this.canEvaluate) throw new Error('Run a model with the local engine before evaluating watches');
    this.busy = true; this.update();
    try { return await this.provider.request('evaluate', { expression, state, ...this.options() }); }
    finally { this.busy = false; this.update(); }
  }
  private async task(action: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.update(); this.status.textContent = 'Analysing captured model…';
    try { await action(); }
    catch (error) {
      this.loaded = false; this.sat = false;
      this.status.textContent = error instanceof ProviderError ? `${error.code}: ${error.message}` : String(error);
      if (error instanceof ProviderError && error.location) this.result({ diagnostic: error.location, error: error.message }, this.snapshot!);
    } finally { this.busy = false; this.update(); }
  }
  private update(): void {
    this.connectButton.disabled = this.busy;
    this.loadButton.disabled = this.busy || !this.connected;
    this.runButton.disabled = this.busy || !this.loaded || !this.commands.options.length;
    this.nextButton.disabled = this.busy || !this.loaded || !this.sat || !this.incremental;
    this.forkButton.disabled = this.nextButton.disabled || !this.temporal;
    this.mode.disabled = this.forkButton.disabled;
    this.commands.disabled = this.busy || !this.loaded;
    this.cancelButton.disabled = !this.busy || !this.connected;
  }
}

/** Label controls explicitly for keyboard and assistive-technology use. */
function field(label: string, control: HTMLElement): HTMLElement { const root = element('label', 'field'); root.append(element('span', '', label), control); return root; }
/** Result wording never treats a timeout or UNSAT command as an example. */
export function outcomeText(data: EngineResult): string {
  switch (data.outcome) {
    case 'example': return 'Example found for the selected command/scopes.';
    case 'counterexample': return 'Counterexample found for the selected command/scopes.';
    case 'no-instance': return 'No instance found for the selected command/scopes.';
    case 'no-counterexample': return 'No counterexample found for the selected command/scopes.';
    case 'exhausted': return 'No further solution for this exploration request; retaining the displayed result.';
    default: return 'Analysis completed.';
  }
}
