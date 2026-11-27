// The parts of REDnode's "rednode" package this app uses, from its own types (REDnode 0.49.0 and 0.68.0,
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
  export interface TitleButton { id: string; label: string; icon?: "key" | "settings" | "back" | "refresh" | "help" | "info" | "add" | "edit" | "search" | "list" | "home" | "pin" | "reset" | "space"; on?: boolean; onClick?: () => void }
  export interface UiWindow {
    readonly id: string;
    readonly closed: boolean;
    set(changes: { title?: string; titleButtons?: TitleButton[]; children?: UiNode<any>[] }): void;
    close(): void;
  }
  export type SelectOption = string | { value: string; label?: string; disabled?: boolean };
  export interface SelectProps { label: string; options: SelectOption[]; value?: string; placeholder?: string; disabled?: boolean }
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
    /** A dropdown (REDnode 0.68.0). `onChange` gets the value the player picks; `set` from code fires none. */
    select(
      label: string,
      options: SelectOption[],
      props?: Omit<SelectProps, "label" | "options"> & { onChange?: (value: string) => void },
    ): UiNode<SelectProps>;
    progress(value: number, options?: { label?: string; max?: number }): UiNode<{ value: number; label?: string; max?: number }>;
    /**
     * A picture (REDnode 0.55.0, #37): a PNG, JPEG, WebP or GIF file in the package's folder or
     * `pkg.dataDir`, a `data:image/...` URL, or the bytes. Older REDnodes have none: check before use.
     */
    image?(src: string | Uint8Array, options?: { width?: number; alt?: string; onClick?: () => void }): UiNode<{ src: string | Uint8Array; width?: number; alt?: string; version?: number }>;
    /** `titleButtons` and `set` need REDnode 0.57.0 (#38): `set` changes the open window's content in place. */
    window(options: { id?: string; title: string; width?: number; height?: number; anchor?: string; x?: number; y?: number; titleButtons?: TitleButton[]; children: UiNode<any>[]; onClose?: () => void }): UiWindow;
  };

  export const kernel: {
    bridge(): Promise<{ version: string | null; call(method: string, params?: Record<string, unknown>): Promise<unknown> }>;
  };

  export const agent: {
    ask(prompt: string, options?: { context?: unknown; onText?: (text: string) => void; signal?: AbortSignal }): Promise<{ text: string; cost: number }>;
  };

  export const pkg: { readonly id: string; readonly dir: string; readonly dataDir: string };

  export const secrets: {
    shared(service: string): Promise<string | null>;
    askShared(service: string, options?: { reason?: string; offer?: string }): Promise<string | null>;
  };

  export interface ReloadResult {
    reloaded: string[];
    failed: { file: string; why: string }[];
    ms: number;
    refreshed?: { slot: string; appearance: string }[];
    preview?: { items: { slot: string; appearance: string }[]; note?: string };
  }
  export const archives: {
    reload(files: string | string[], options?: { refresh?: boolean }): Promise<ReloadResult>;
  };
}
