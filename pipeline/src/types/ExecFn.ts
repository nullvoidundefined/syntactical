export interface ExecOptions {
    cwd: string;
    env: NodeJS.ProcessEnv;
    input: string;
}

export type ExecFn = (file: string, args: string[], options: ExecOptions) => Promise<{ stdout: string }>;
