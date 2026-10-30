// The parts of REDnode's "rednode" package this app uses, from its own types (REDnode 0.48.1,
// packages/rednode/dist). REDnode gives the package at run time; it is not on npm.

declare module "rednode" {
  export interface GameRef {
    readonly $ref: number;
    readonly $type: string;
    $call(fullName: string, ...args: unknown[]): Promise<any>;
    [method: string]: any;
  }

  export const api: {
    GetPlayer(gameInstance: unknown): Promise<GameRef | null>;
    EquipmentSystem: { GetData(owner: GameRef): Promise<GameRef | null> };
    [name: string]: any;
  };

  export interface GameState {
    world: boolean;
    menu: boolean;
    mainMenu: boolean;
  }

  export const game: {
    instance: unknown;
    state(): Promise<GameState>;
    onState(handler: (state: GameState) => void): () => void;
    on(name: string, handler: (value?: unknown) => void): () => void;
  };

  export interface UiNode<Props extends object = Record<string, unknown>> {
    readonly id: string;
    readonly props: Readonly<Props>;
    set(props: Partial<Props>): void;
  }
  export interface TextProps { text: string; tone?: "normal" | "dim" | "accent" | "danger" }
  export interface ButtonProps { label: string; variant?: "primary" | "ghost" | "danger"; disabled?: boolean }
  export interface InputProps { label?: string; placeholder?: string; value?: string }
  export interface UiList extends UiNode<{ lines: string[] }> {
    push(...lines: string[]): void;
    clear(): void;
  }
  export const ui: {
    text(text: string, options?: Omit<TextProps, "text">): UiNode<TextProps>;
    heading(text: string): UiNode<TextProps>;
    button(label: string, onClick?: () => void, options?: Omit<ButtonProps, "label">): UiNode<ButtonProps>;
    input(options?: InputProps & { onChange?: (value: string) => void; onSubmit?: (value: string) => void }): UiNode<InputProps>;
    list(options?: { lines?: string[]; keep?: number; height?: number; follow?: boolean }): UiList;
    row(...children: UiNode<any>[]): UiNode<Record<string, never>>;
    column(...children: UiNode<any>[]): UiNode<Record<string, never>>;
    window(options: { id?: string; title: string; width?: number; height?: number; anchor?: string; x?: number; y?: number; children: UiNode<any>[]; onClose?: () => void }): { close(): void };
  };

  export const kernel: {
    bridge(): Promise<{ version?: string; call(method: string, params?: Record<string, unknown>): Promise<unknown> }>;
  };

  export const agent: {
    ask(prompt: string, options?: { context?: unknown; onText?: (text: string) => void; signal?: AbortSignal }): Promise<{ text: string; cost: number }>;
  };

  export const pkg: { readonly id: string; readonly dir: string; readonly dataDir: string };
}
